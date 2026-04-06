import React, { useState } from 'react';
import type { ReviewMeta } from './AutoReviewCountdown';

interface ReviewMetaBannerProps {
  meta: ReviewMeta;
  onDismiss: () => void;
}

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

export const ReviewMetaBanner: React.FC<ReviewMetaBannerProps> = ({ meta, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);

  const modelNames = meta.models.map(m => formatModelName(m.modelId));
  const totalTokens = meta.models.reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0)
    + (meta.synthesizer ? meta.synthesizer.inputTokens + meta.synthesizer.outputTokens : 0);

  return (
    <div className="sticky top-12 z-40 border-b border-primary/20 bg-primary/5 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-1.5 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium text-primary shrink-0">🧠 Multi-LLM Review</span>
          <span className="text-muted-foreground shrink-0">
            {modelNames.length} models · {formatDuration(meta.totalDurationMs)} · {formatCost(meta.estimatedCost)}
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            {expanded ? 'Less' : 'Details'}
          </button>
        </div>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
          title="Dismiss"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {meta.models.map((m) => (
            <span key={m.name} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              {formatModelName(m.modelId)}
              <span className="opacity-60">
                {((m.inputTokens + m.outputTokens) / 1000).toFixed(1)}k tok
              </span>
            </span>
          ))}
          {meta.synthesizer && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
              {formatModelName(meta.synthesizer.modelId)} (synthesizer)
              <span className="opacity-60">
                {((meta.synthesizer.inputTokens + meta.synthesizer.outputTokens) / 1000).toFixed(1)}k tok
              </span>
            </span>
          )}
          <span className="opacity-60">
            Total: {(totalTokens / 1000).toFixed(1)}k tokens
          </span>
        </div>
      )}
    </div>
  );
};
