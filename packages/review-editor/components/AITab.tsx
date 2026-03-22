import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { AIMessage } from '../hooks/useAIChat';
import { renderInlineMarkdown } from '../utils/renderInlineMarkdown';
import { formatLineRange } from '../utils/formatLineRange';
import { SparklesIcon } from './SparklesIcon';

interface AITabProps {
  messages: AIMessage[];
  isCreatingSession: boolean;
  isStreaming: boolean;
  activeFilePath?: string;
  scrollToQuestionId?: string | null;
  onScrollToLines: (filePath: string, lineStart: number, lineEnd: number, side: 'old' | 'new') => void;
  onAskGeneral?: (question: string) => void;
}

interface FileGroup {
  filePath: string;
  messages: AIMessage[];
}

function getQuestionScope(q: AIMessage['question']): 'general' | 'file' | 'line' {
  if (!q.filePath) return 'general';
  if (q.lineStart == null) return 'file';
  return 'line';
}

export const AITab: React.FC<AITabProps> = ({
  messages,
  isCreatingSession,
  isStreaming,
  activeFilePath,
  scrollToQuestionId,
  onScrollToLines,
  onAskGeneral,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [generalInput, setGeneralInput] = useState('');
  const [highlightFilePath, setHighlightFilePath] = useState<string | null>(null);

  // Group messages by file
  const { fileGroups, generalMessages } = useMemo(() => {
    const grouped = new Map<string, AIMessage[]>();
    const general: AIMessage[] = [];

    for (const msg of messages) {
      if (!msg.question.filePath) {
        general.push(msg);
      } else {
        const existing = grouped.get(msg.question.filePath) || [];
        existing.push(msg);
        grouped.set(msg.question.filePath, existing);
      }
    }

    const fileGroups: FileGroup[] = [];
    for (const [filePath, msgs] of grouped) {
      // Sort: file-scoped first, then line-scoped by lineStart
      msgs.sort((a, b) => {
        const aScope = getQuestionScope(a.question);
        const bScope = getQuestionScope(b.question);
        if (aScope !== bScope) return aScope === 'file' ? -1 : 1;
        return (a.question.lineStart ?? 0) - (b.question.lineStart ?? 0);
      });
      fileGroups.push({ filePath, messages: msgs });
    }

    return { fileGroups, generalMessages: general };
  }, [messages]);

  // Auto-expand active file's group
  useEffect(() => {
    if (activeFilePath) {
      setExpandedFiles(prev => {
        if (prev.has(activeFilePath)) return prev;
        const next = new Set(prev);
        next.add(activeFilePath);
        return next;
      });
    }
  }, [activeFilePath]);

  // Scroll to specific question and flash-highlight its file group header
  useEffect(() => {
    if (!scrollToQuestionId || !scrollRef.current) return;

    // Find which file this question belongs to
    const msg = messages.find(m => m.question.id === scrollToQuestionId);
    const filePath = msg?.question.filePath;

    if (filePath) {
      // Scroll the file group header into view
      const header = scrollRef.current.querySelector(`[data-file-group="${CSS.escape(filePath)}"]`);
      if (header) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Flash-highlight the file group header
      setHighlightFilePath(filePath);
      setTimeout(() => setHighlightFilePath(null), 1200);
    }

    // If expanded, also scroll the Q&A into view after the header scroll settles
    if (filePath && expandedFiles.has(filePath)) {
      setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-question-id="${scrollToQuestionId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [scrollToQuestionId]);

  // Auto-scroll: keep the latest message visible without hiding file group headers
  useEffect(() => {
    if (!scrollRef.current) return;
    if (!isStreaming && messages.length === 0) return;

    const allQAs = scrollRef.current.querySelectorAll('[data-question-id]');
    const lastQA = allQAs[allQAs.length - 1];
    if (lastQA) {
      lastQA.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isStreaming]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const handleGeneralSubmit = () => {
    if (!generalInput.trim() || !onAskGeneral) return;
    onAskGeneral(generalInput.trim());
    setGeneralInput('');
  };

  if (messages.length === 0 && !isCreatingSession) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6 py-12 text-center">
          <SparklesIcon className="w-8 h-8 mb-3 opacity-40" />
          <p className="text-xs">Select lines and click <strong>Ask AI</strong>, or ask a general question below.</p>
        </div>
        {onAskGeneral && (
          <div className="ai-general-input">
            <textarea
              value={generalInput}
              onChange={(e) => setGeneralInput(e.target.value)}
              placeholder="Ask about the overall changes..."
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                  handleGeneralSubmit();
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {isCreatingSession && messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            <span className="ai-streaming-cursor" /> Starting AI session...
          </div>
        )}

        {/* File-grouped questions */}
        {fileGroups.map(({ filePath, messages: fileMessages }) => {
          const isExpanded = expandedFiles.has(filePath);
          const basename = filePath.split('/').pop() || filePath;

          return (
            <div key={filePath} className="mb-2">
              <button
                data-file-group={filePath}
                className={`ai-file-group-header ${highlightFilePath === filePath ? 'ai-file-group-highlight' : ''}`}
                onClick={() => toggleFile(filePath)}
              >
                <svg
                  className={`w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="truncate">{basename}</span>
                <span className="text-[9px] font-mono bg-muted px-1 py-0.5 rounded ml-auto flex-shrink-0">
                  {fileMessages.length}
                </span>
              </button>

              {isExpanded && (
                <div className="pl-3 space-y-2 mt-1">
                  {fileMessages.map(({ question, response }) => (
                    <QAPair key={question.id} question={question} response={response} onScrollToLines={onScrollToLines} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* General questions (no file scope) — below file groups */}
        {generalMessages.length > 0 && (
          <div className="mb-3 mt-1">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              General
            </div>
            <div className="space-y-2">
              {generalMessages.map(({ question, response }) => (
                <QAPair key={question.id} question={question} response={response} onScrollToLines={onScrollToLines} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* General question input — always visible at bottom */}
      {onAskGeneral && (
        <div className="ai-general-input">
          <textarea
            value={generalInput}
            onChange={(e) => setGeneralInput(e.target.value)}
            placeholder="Ask about the overall changes..."
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
                handleGeneralSubmit();
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

/** Single Q&A pair */
const QAPair: React.FC<{
  question: AIMessage['question'];
  response: AIMessage['response'];
  onScrollToLines: AITabProps['onScrollToLines'];
}> = ({ question, response, onScrollToLines }) => {
  const scope = getQuestionScope(question);

  return (
    <div data-question-id={question.id} className="flex flex-col gap-1.5">
      {/* Question */}
      <div className="ai-question-bubble">
        {scope === 'line' && question.filePath && question.lineStart != null && question.lineEnd != null && (
          <button
            className="ai-line-ref"
            onClick={() => onScrollToLines(question.filePath!, question.lineStart!, question.lineEnd!, question.side ?? 'new')}
          >
            {formatLineRange(question.lineStart, question.lineEnd)}
          </button>
        )}
        {scope === 'file' && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary inline-block">
            file
          </span>
        )}
        <p className="text-xs mt-1">{question.prompt}</p>
      </div>

      {/* Response */}
      <div className="ai-response-bubble">
        {response.error ? (
          <p className="text-xs text-destructive">{response.error}</p>
        ) : response.text ? (
          <div className="text-xs review-comment-body">
            {renderInlineMarkdown(response.text)}
            {response.isStreaming && <span className="ai-streaming-cursor inline-block ml-0.5" />}
          </div>
        ) : response.isStreaming ? (
          <span className="text-xs text-muted-foreground">
            <span className="ai-streaming-cursor" /> Thinking...
          </span>
        ) : null}
      </div>
    </div>
  );
};
