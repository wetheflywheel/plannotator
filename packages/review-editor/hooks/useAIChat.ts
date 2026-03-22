import { useState, useCallback, useRef, useEffect } from 'react';
import type { AIQuestion, AIResponse } from '@plannotator/ui/types';

export interface AIMessage {
  question: AIQuestion;
  response: AIResponse;
}

interface UseAIChatOptions {
  patch: string;
}

interface AskParams {
  prompt: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  side?: 'old' | 'new';
  selectedCode?: string;
}

export function useAIChat({ patch }: UseAIChatOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Keep ref in sync for use inside async callbacks
  sessionIdRef.current = sessionId;

  const createSession = useCallback(async (signal: AbortSignal): Promise<string> => {
    setIsCreatingSession(true);
    try {
      const res = await fetch('/api/ai/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            mode: 'code-review',
            review: { patch },
          },
        }),
        signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to create AI session' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json() as { sessionId: string };
      setSessionId(data.sessionId);
      sessionIdRef.current = data.sessionId;
      return data.sessionId;
    } finally {
      setIsCreatingSession(false);
    }
  }, [patch]);

  const ask = useCallback(async (params: AskParams) => {
    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);

    const questionId = Math.random().toString(36).substring(2, 9);
    const question: AIQuestion = {
      id: questionId,
      prompt: params.prompt,
      filePath: params.filePath,
      lineStart: params.lineStart,
      lineEnd: params.lineEnd,
      side: params.side,
      selectedCode: params.selectedCode,
      createdAt: Date.now(),
    };

    const response: AIResponse = {
      questionId,
      text: '',
      isStreaming: true,
      createdAt: Date.now(),
    };

    // Add the message pair immediately so the UI shows the question
    setMessages(prev => [...prev, { question, response }]);
    setIsStreaming(true);

    try {
      // Lazy session creation
      let sid = sessionIdRef.current;
      if (!sid) {
        sid = await createSession(controller.signal);
      }

      // Build the prompt with context based on scope
      let fullPrompt = params.prompt;
      if (params.filePath && params.lineStart != null && params.lineEnd != null) {
        // Line-scoped
        const lineRef = params.lineStart === params.lineEnd
          ? `line ${params.lineStart}`
          : `lines ${params.lineStart}-${params.lineEnd}`;
        const sideLabel = params.side === 'new' ? 'new (added)' : 'old (removed)';
        const codeBlock = params.selectedCode
          ? `\n\`\`\`\n${params.selectedCode}\n\`\`\`\n`
          : '';
        fullPrompt = `Re: ${params.filePath}, ${lineRef} (${sideLabel} side)${codeBlock}\n${params.prompt}`;
      } else if (params.filePath) {
        // File-scoped
        fullPrompt = `Re: ${params.filePath} (entire file)\n\n${params.prompt}`;
      }
      // else: general — use prompt as-is

      // Start SSE stream
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, prompt: fullPrompt }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: 'Query failed' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      // Parse SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const msg = JSON.parse(data);

            if (msg.type === 'text_delta') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.question.id === questionId) {
                  last.response = { ...last.response, text: last.response.text + msg.delta };
                }
                return updated;
              });
            } else if (msg.type === 'text') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.question.id === questionId) {
                  last.response = { ...last.response, text: last.response.text + msg.text };
                }
                return updated;
              });
            } else if (msg.type === 'error') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.question.id === questionId) {
                  last.response = { ...last.response, error: msg.error, isStreaming: false };
                }
                return updated;
              });
              setError(msg.error);
            } else if (msg.type === 'result') {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.question.id === questionId) {
                  last.response = { ...last.response, isStreaming: false };
                }
                return updated;
              });
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Finalize if not already done
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.question.id === questionId && last.response.isStreaming) {
          last.response = { ...last.response, isStreaming: false };
        }
        return updated;
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;

      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.question.id === questionId) {
          last.response = { ...last.response, error: message, isStreaming: false };
        }
        return updated;
      });
    } finally {
      if (abortRef.current === controller) {
        setIsStreaming(false);
        abortRef.current = null;
      }
    }
  }, [createSession]);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }
    // Also tell the server to abort
    if (sessionIdRef.current) {
      fetch('/api/ai/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    isCreatingSession,
    isStreaming,
    error,
    ask,
    abort,
    sessionId,
  };
}
