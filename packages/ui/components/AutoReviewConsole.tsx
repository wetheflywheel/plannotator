import React, { useEffect, useRef, useState } from 'react';
import { useAutoReview, type LogEntry } from '../contexts/AutoReviewContext';

interface AutoReviewConsoleProps {
  /** Called when the "View diff →" button is clicked in the Changes section. */
  onOpenDiff?: () => void;
}

// ----- formatting helpers -----

function formatModelName(modelId: string): string {
  const map: Record<string, string> = {
    'google/gemini-3-flash-preview': 'Gemini 3 Flash',
    'openai/gpt-4.1-mini': 'GPT-4.1 Mini',
    'x-ai/grok-4.1-fast': 'Grok 4.1 Fast',
    'deepseek/deepseek-chat-v3-0324': 'DeepSeek V3',
    'mistralai/mistral-small-3.1-24b-instruct': 'Mistral Small 3.1',
  };
  return map[modelId] || modelId.split('/').pop() || modelId;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001';
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// OpenRouter pricing, duplicated from the pill so we can compute per-model
// cost for the Models section without plumbing another prop.
const PRICING: Record<string, { input: number; output: number }> = {
  'google/gemini-3-flash-preview': { input: 0.05, output: 0.15 },
  'openai/gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'x-ai/grok-4.1-fast': { input: 0.15, output: 0.60 },
  'deepseek/deepseek-chat-v3-0324': { input: 0.14, output: 0.28 },
  'mistralai/mistral-small-3.1-24b-instruct': { input: 0.10, output: 0.30 },
};

function perModelCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[modelId] || { input: 0.20, output: 0.60 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ----- phase label -----

function phaseLabel(phase: string): { label: string; className: string } {
  switch (phase) {
    case 'deliberating':
      return { label: 'Deliberating', className: 'text-primary' };
    case 'applying':
      return { label: 'Applying', className: 'text-primary' };
    case 'approval_countdown':
      return { label: 'Review complete', className: 'text-emerald-500' };
    case 'approval_paused':
      return { label: 'Paused (post-review)', className: 'text-muted-foreground' };
    case 'done':
      return { label: 'Done', className: 'text-emerald-500' };
    case 'error':
      return { label: 'Error', className: 'text-destructive' };
    default:
      return { label: phase, className: 'text-muted-foreground' };
  }
}

// ----- log line -----

const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  let icon = '›';
  let iconClass = 'text-muted-foreground';
  let textClass = 'text-foreground/90';

  switch (entry.level) {
    case 'ok':
      icon = '✓';
      iconClass = 'text-emerald-500';
      textClass = 'text-foreground/90';
      break;
    case 'error':
      icon = '✗';
      iconClass = 'text-destructive';
      textClass = 'text-destructive';
      break;
    case 'system':
      icon = '⋯';
      iconClass = 'text-muted-foreground';
      textClass = 'text-muted-foreground italic';
      break;
    default:
      break;
  }

  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="text-muted-foreground/60 shrink-0 tabular-nums">
        {formatTimestamp(entry.ts)}
      </span>
      <span className={`shrink-0 ${iconClass}`}>{icon}</span>
      <span className={`break-words ${textClass}`}>{entry.text}</span>
    </div>
  );
};

// ----- main drawer -----

export const AutoReviewConsole: React.FC<AutoReviewConsoleProps> = ({ onOpenDiff }) => {
  const {
    phase,
    logLines,
    consensusText,
    diffStats,
    meta,
    isDrawerOpen,
    isLogCollapsed,
    redTeamFindings,
    redTeamLoading,
    redTeamError,
    actions,
  } = useAutoReview();

  const logScrollRef = useRef<HTMLDivElement>(null);
  const [consensusExpanded, setConsensusExpanded] = useState(false);
  const [consensusModalOpen, setConsensusModalOpen] = useState(false);

  // Auto-scroll the log pane to the bottom whenever new lines arrive.
  useEffect(() => {
    if (!logScrollRef.current) return;
    logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
  }, [logLines.length]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && consensusModalOpen) {
        setConsensusModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [consensusModalOpen]);

  if (!isDrawerOpen) return null;
  if (phase === 'idle') return null;

  const { label, className: labelClass } = phaseLabel(phase);

  const hasLog = logLines.length > 0;
  const hasConsensus = consensusText.trim().length > 0;
  const hasDiff = diffStats && (diffStats.additions > 0 || diffStats.deletions > 0);
  const hasMeta = meta && meta.models.length > 0;
  const hasRedTeam = Boolean(
    redTeamFindings || redTeamLoading || redTeamError,
  );

  // Consensus collapse heuristic — show first ~5 lines, let user expand.
  const consensusLines = consensusText.split('\n');
  const consensusPreview =
    consensusLines.length > 6 && !consensusExpanded
      ? consensusLines.slice(0, 6).join('\n') + '\n…'
      : consensusText;

  return (
    <div className="sticky top-12 z-40 w-full bg-muted/40 backdrop-blur-sm border-b border-border shadow-sm">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-2 text-xs border-b border-border/60">
        <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-medium text-foreground">Multi-LLM Console</span>
        <span className="text-muted-foreground">·</span>
        <span className={labelClass}>{label}</span>
        {phase === 'deliberating' && (
          <svg className="w-3 h-3 animate-spin text-primary" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        <div className="flex-1" />
        {hasLog && (
          <button
            onClick={() => actions.toggleLogCollapsed()}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title={isLogCollapsed ? 'Show log' : 'Hide log'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
              {isLogCollapsed ? (
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M3 8h10" strokeLinecap="round" />
              )}
            </svg>
          </button>
        )}
        <button
          onClick={() => actions.closeDrawer()}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Close console"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
        {/* Agents log */}
        {hasLog && !isLogCollapsed && (
          <section>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Agents
              </span>
              <div className="flex-1 border-b border-border/60" />
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                {logLines.length} {logLines.length === 1 ? 'line' : 'lines'}
              </span>
            </div>
            <div
              ref={logScrollRef}
              className="font-mono text-[11px] leading-snug min-h-[120px] max-h-80 overflow-y-auto bg-background/60 rounded border border-border/50 px-2 py-1.5"
            >
              {logLines.map((entry, i) => (
                <LogLine key={i} entry={entry} />
              ))}
            </div>
          </section>
        )}

        {/* Consensus */}
        {hasConsensus && (
          <section>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Consensus
              </span>
              <div className="flex-1 border-b border-border/60" />
              <span className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-foreground" onClick={() => setConsensusModalOpen(true)}>
                Click to expand
              </span>
            </div>
            <div
              onClick={() => setConsensusModalOpen(true)}
              className="cursor-pointer group text-sm leading-relaxed text-foreground/90 bg-background/60 rounded border border-border/50 px-3 py-2.5 font-sans max-h-48 overflow-hidden hover:bg-background/80 transition-colors"
            >
              <pre className="whitespace-pre-wrap">
                {consensusPreview}
              </pre>
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-background/60 rounded opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </section>
        )}

        {/* Consensus Modal */}
        {consensusModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setConsensusModalOpen(false)}
          >
            <div
              className="bg-background rounded-lg shadow-lg max-w-2xl w-11/12 max-h-[80vh] overflow-hidden flex flex-col border border-border"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                <span className="text-sm font-medium text-foreground">
                  Multi-LLM Consensus
                </span>
                <button
                  onClick={() => setConsensusModalOpen(false)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Close (Esc)"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {/* Modal content with scroll */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-sans">
                  {consensusText}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Adversarial review — single cheap model that runs AFTER consensus
            with the explicit job of finding what the council missed. Orange
            callout to distinguish from the green "consensus achieved" tone. */}
        {hasRedTeam && (
          <section>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Adversarial review
              </span>
              <div className="flex-1 border-b border-border/60" />
            </div>
            {redTeamLoading && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground italic">
                <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                  <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Running adversarial pass…</span>
              </div>
            )}
            {!redTeamLoading && redTeamError && (
              <div className="text-[11px] text-muted-foreground italic">
                Adversarial review failed: {redTeamError}
              </div>
            )}
            {!redTeamLoading && !redTeamError && redTeamFindings && (
              <div className="bg-warning/10 border border-warning/20 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="w-3.5 h-3.5 text-warning shrink-0"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M8 1.5l7 13H1l7-13z" strokeLinejoin="round" />
                    <path d="M8 6.5v3.5M8 12v0.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-[11px] font-medium text-foreground">
                    Adversarial review · openai/gpt-4.1-mini
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-sans">
                  {redTeamFindings}
                </pre>
              </div>
            )}
          </section>
        )}

        {/* Changes (diff stats) */}
        {hasDiff && (
          <section>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Changes
              </span>
              <div className="flex-1 border-b border-border/60" />
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-500 font-mono tabular-nums">
                <span>+{diffStats!.additions}</span>
              </span>
              <span className="flex items-center gap-1 text-destructive font-mono tabular-nums">
                <span>−{diffStats!.deletions}</span>
              </span>
              <span className="text-muted-foreground">lines</span>
              {onOpenDiff && (
                <button
                  onClick={onOpenDiff}
                  className="ml-auto px-2 py-0.5 text-[11px] rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                >
                  View diff →
                </button>
              )}
            </div>
          </section>
        )}

        {/* Models */}
        {hasMeta && (
          <section>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Models
              </span>
              <div className="flex-1 border-b border-border/60" />
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                {formatDuration(meta!.totalDurationMs)} · {formatCost(meta!.estimatedCost)}
              </span>
            </div>
            <div className="space-y-0.5">
              {meta!.models.map((m) => {
                const totalTokens = m.inputTokens + m.outputTokens;
                const cost = perModelCost(m.modelId, m.inputTokens, m.outputTokens);
                return (
                  <div
                    key={m.name + m.modelId}
                    className="flex items-center gap-2 text-[11px] tabular-nums"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                    <span className="text-foreground/90 min-w-[140px]">
                      {formatModelName(m.modelId)}
                    </span>
                    <span className="text-muted-foreground">
                      {(totalTokens / 1000).toFixed(1)}k tok
                    </span>
                    <span className="text-muted-foreground/70">·</span>
                    <span className="text-muted-foreground">{formatCost(cost)}</span>
                  </div>
                );
              })}
              {meta!.synthesizer && (
                <div className="flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
                  <span className="text-foreground/90 min-w-[140px]">
                    {formatModelName(meta!.synthesizer.modelId)}
                    <span className="text-muted-foreground/70 ml-1">(synth.)</span>
                  </span>
                  <span className="text-muted-foreground">
                    {(
                      (meta!.synthesizer.inputTokens + meta!.synthesizer.outputTokens) /
                      1000
                    ).toFixed(1)}
                    k tok
                  </span>
                  <span className="text-muted-foreground/70">·</span>
                  <span className="text-muted-foreground">
                    {formatCost(
                      perModelCost(
                        meta!.synthesizer.modelId,
                        meta!.synthesizer.inputTokens,
                        meta!.synthesizer.outputTokens,
                      ),
                    )}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Empty state: drawer open but no data yet */}
        {!hasLog && !hasConsensus && !hasDiff && !hasMeta && !hasRedTeam && (
          <div className="text-[11px] text-muted-foreground italic py-2">
            Waiting for deliberation to start…
          </div>
        )}
      </div>
    </div>
  );
};
