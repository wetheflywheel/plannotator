import React, { useState, useEffect, useRef, useCallback } from 'react';

type Phase =
  | 'idle'
  | 'countdown'
  | 'paused'
  | 'deliberating'
  | 'applying'
  | 'error'
  | 'approval_countdown'
  | 'approval_paused'
  | 'done';

export interface ReviewMeta {
  models: { name: string; modelId: string; inputTokens: number; outputTokens: number }[];
  synthesizer?: { modelId: string; inputTokens: number; outputTokens: number };
  totalDurationMs: number;
  estimatedCost: number;
}

interface AutoReviewCountdownProps {
  plan: string;
  onPlanRevised: (newPlan: string, versionInfo: any) => void;
  onAutoApprove: () => void;
  onAnnotationsCleared?: () => void;
  onReviewComplete?: (meta: ReviewMeta) => void;
  hasAnnotations: boolean;
  disabled?: boolean;
  countdownSeconds?: number;
}

export const AutoReviewCountdown: React.FC<AutoReviewCountdownProps> = ({
  plan,
  onPlanRevised,
  onAutoApprove,
  onAnnotationsCleared,
  onReviewComplete,
  hasAnnotations,
  disabled = false,
  countdownSeconds = 45,
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consensusRef = useRef<string>('');
  const structuredRef = useRef<any>(null);
  const planRef = useRef(plan);

  // Keep planRef in sync
  useEffect(() => { planRef.current = plan; }, [plan]);

  // Auto-start countdown on mount
  useEffect(() => {
    if (!disabled) {
      setPhase('countdown');
      setSecondsLeft(countdownSeconds);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause countdown if user adds annotations
  useEffect(() => {
    if (hasAnnotations && phase === 'countdown') {
      setPhase('paused');
    }
  }, [hasAnnotations, phase]);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'approval_countdown') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          if (phase === 'countdown') startDeliberation();
          if (phase === 'approval_countdown') {
            setPhase('done');
            onAutoApprove();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDeliberation = useCallback(async () => {
    setPhase('deliberating');
    setStatusText('Starting review...');
    setErrorMsg('');
    consensusRef.current = '';

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/multi-llm-review-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planRef.current }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.event === 'log') {
              setStatusText(evt.message || 'Processing...');
            } else if (evt.event === 'error') {
              throw new Error(evt.message || 'Deliberation failed');
            } else if (evt.event === 'result') {
              consensusRef.current = typeof evt.result === 'string' ? evt.result : JSON.stringify(evt.structured || evt.result);
              if (evt.structured) structuredRef.current = evt.structured;
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue; // Skip malformed SSE
            throw e;
          }
        }
      }

      if (!consensusRef.current) {
        throw new Error('No result received from deliberation');
      }

      // Apply the review feedback
      await applyFeedback(consensusRef.current);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setPhase('error');
      setErrorMsg(err.message || 'Unknown error');
    }
  }, []);

  const buildReviewMeta = useCallback((): ReviewMeta | null => {
    const s = structuredRef.current;
    if (!s?.models) return null;
    // Estimate cost using OpenRouter's approximate pricing (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'google/gemini-3-flash-preview': { input: 0.05, output: 0.15 },
      'openai/gpt-4.1-mini': { input: 0.40, output: 1.60 },
      'x-ai/grok-4.1-fast': { input: 0.15, output: 0.60 },
      'deepseek/deepseek-chat-v3-0324': { input: 0.14, output: 0.28 },
      'mistralai/mistral-small-3.1-24b-instruct': { input: 0.10, output: 0.30 },
    };
    let totalCost = 0;
    for (const m of s.models) {
      const p = pricing[m.modelId] || { input: 0.20, output: 0.60 };
      totalCost += (m.inputTokens * p.input + m.outputTokens * p.output) / 1_000_000;
    }
    if (s.synthesizer) {
      const p = pricing[s.synthesizer.modelId] || { input: 0.20, output: 0.60 };
      totalCost += (s.synthesizer.inputTokens * p.input + s.synthesizer.outputTokens * p.output) / 1_000_000;
    }
    return {
      models: s.models,
      synthesizer: s.synthesizer,
      totalDurationMs: s.totalDurationMs || 0,
      estimatedCost: totalCost,
    };
  }, []);

  const applyFeedback = useCallback(async (feedback: string) => {
    setPhase('applying');
    setStatusText('Applying feedback...');

    try {
      const res = await fetch('/api/apply-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planRef.current, feedback }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `Failed to apply review`);
      }

      const data = await res.json();
      onPlanRevised(data.plan, data.versionInfo);
      onAnnotationsCleared?.();

      const meta = buildReviewMeta();
      if (meta) onReviewComplete?.(meta);

      // Start approval countdown
      setSecondsLeft(countdownSeconds);
      setPhase('approval_countdown');
    } catch (err: any) {
      setPhase('error');
      setErrorMsg(err.message || 'Failed to apply feedback');
    }
  }, [countdownSeconds, onPlanRevised, onAnnotationsCleared]);

  const handlePause = () => {
    if (phase === 'countdown') setPhase('paused');
    else if (phase === 'approval_countdown') setPhase('approval_paused');
  };

  const handleResume = () => {
    if (phase === 'paused') setPhase('countdown');
    else if (phase === 'approval_paused') setPhase('approval_countdown');
  };

  const handleRunNow = () => {
    if (phase === 'countdown' || phase === 'paused') {
      startDeliberation();
    }
  };

  const handleStop = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase('idle');
  };

  const handleRetry = () => {
    startDeliberation();
  };

  if (phase === 'idle' || phase === 'done' || disabled) return null;

  // Circular progress for countdowns
  const progress = (phase === 'countdown' || phase === 'approval_countdown')
    ? secondsLeft / countdownSeconds
    : 0;
  const circumference = 2 * Math.PI * 8;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 border border-primary/20 text-primary select-none">
      {/* Countdown phases */}
      {(phase === 'countdown' || phase === 'approval_countdown') && (
        <>
          <svg className="w-5 h-5 -rotate-90 shrink-0" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
            <circle
              cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <span className="whitespace-nowrap" title={phase === 'countdown' ? 'Will run multi-LLM review: 4 models deliberate on your plan, then auto-revise it' : 'Will auto-approve the revised plan'}>
            {phase === 'countdown' ? `Multi-LLM review in ${secondsLeft}s` : `Auto-approve in ${secondsLeft}s`}
          </span>
          <button onClick={handlePause} className="p-0.5 rounded hover:bg-primary/20" title="Pause countdown">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx="0.5" /><rect x="9" y="3" width="3" height="10" rx="0.5" /></svg>
          </button>
          {phase === 'countdown' && (
            <button onClick={handleRunNow} className="p-0.5 rounded hover:bg-primary/20" title="Run multi-LLM review now">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3l8 5-8 5V3z" /></svg>
            </button>
          )}
          <button onClick={handleStop} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Cancel — stop auto-review">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
          </button>
        </>
      )}

      {/* Paused */}
      {(phase === 'paused' || phase === 'approval_paused') && (
        <>
          <span className="text-muted-foreground whitespace-nowrap">
            {phase === 'paused' ? 'Multi-LLM review paused' : 'Auto-approve paused'}
          </span>
          <button onClick={handleResume} className="p-0.5 rounded hover:bg-primary/20" title="Resume countdown">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><path d="M5 3l8 5-8 5V3z" /></svg>
          </button>
          {phase === 'paused' && (
            <button onClick={handleRunNow} className="p-0.5 rounded hover:bg-primary/20 text-[10px]" title="Run multi-LLM review now">
              Now
            </button>
          )}
          <button onClick={handleStop} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Cancel — stop auto-review">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
          </button>
        </>
      )}

      {/* Deliberating */}
      {phase === 'deliberating' && (
        <>
          <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="whitespace-nowrap max-w-[180px] truncate">{statusText}</span>
          <button onClick={handleStop} className="p-0.5 rounded hover:bg-destructive/20 text-destructive" title="Stop">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>
          </button>
        </>
      )}

      {/* Applying */}
      {phase === 'applying' && (
        <>
          <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="whitespace-nowrap">{statusText}</span>
        </>
      )}

      {/* Error */}
      {phase === 'error' && (
        <>
          <span className="text-destructive whitespace-nowrap max-w-[180px] truncate" title={errorMsg}>
            Review failed
          </span>
          <button onClick={handleRetry} className="p-0.5 rounded hover:bg-primary/20" title="Retry">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
              <path d="M2 8a6 6 0 0111.5-2.5M14 8a6 6 0 01-11.5 2.5" strokeLinecap="round" />
              <path d="M14 2v4h-4M2 14v-4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={handleStop} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Dismiss">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" /></svg>
          </button>
        </>
      )}
    </div>
  );
};
