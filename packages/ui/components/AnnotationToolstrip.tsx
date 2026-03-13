import React, { useState, useEffect } from 'react';
import type { EditorMode, InputMethod } from '../types';
import { TaterSpritePullup } from './TaterSpritePullup';
import { ToolstripButton } from './ToolstripButton';

interface AnnotationToolstripProps {
  inputMethod: InputMethod;
  onInputMethodChange: (method: InputMethod) => void;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  taterMode?: boolean;
}

export const AnnotationToolstrip: React.FC<AnnotationToolstripProps> = ({
  inputMethod,
  onInputMethodChange,
  mode,
  onModeChange,
  taterMode,
}) => {
  const [showHelp, setShowHelp] = useState(false);
  const [helpTab, setHelpTab] = useState<'selection' | 'plannotator'>('selection');
  const [mounted, setMounted] = useState(false);

  // Enable transitions only after first paint
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Input method group */}
        <div className="inline-flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border/30">
          <ToolstripButton
            active={inputMethod === 'drag'}
            onClick={() => onInputMethodChange('drag')}
            label="Select"
            color="primary"
            mounted={mounted}
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6"/>
                <path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/>
                <path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/>
                <path d="M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1"/>
                <path d="M9 6v12"/>
              </svg>
            }
          />
          <ToolstripButton
            active={inputMethod === 'pinpoint'}
            onClick={() => onInputMethodChange('pinpoint')}
            label="Pinpoint"
            color="primary"
            mounted={mounted}
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
              </svg>
            }
          />
        </div>

        {/* Action mode group */}
        <div className="inline-flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5 border border-border/30">
          <ToolstripButton
            active={mode === 'selection'}
            onClick={() => onModeChange('selection')}
            label="Markup"
            color="secondary"
            mounted={mounted}
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            }
          />
          <ToolstripButton
            active={mode === 'comment'}
            onClick={() => onModeChange('comment')}
            label="Comment"
            color="accent"
            mounted={mounted}
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            }
          />
          <ToolstripButton
            active={mode === 'redline'}
            onClick={() => onModeChange('redline')}
            label="Redline"
            color="destructive"
            mounted={mounted}
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33z" />
              </svg>
            }
          />
          <ToolstripButton
            active={mode === 'quickLabel'}
            onClick={() => onModeChange('quickLabel')}
            label="Label"
            color="warning"
            mounted={mounted}
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          />
        </div>

        {/* Help */}
        <button
          onClick={() => setShowHelp(true)}
          className="ml-2 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors hidden sm:block"
        >
          how does this work?
        </button>
      </div>

      {/* Help Video Dialog */}
      {showHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            {taterMode && <TaterSpritePullup />}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                <button
                  onClick={() => setHelpTab('selection')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    helpTab === 'selection'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Selection Modes
                </button>
                <button
                  onClick={() => setHelpTab('plannotator')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    helpTab === 'plannotator'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  How Plannotator Works
                </button>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                key={helpTab}
                width="100%"
                height="100%"
                src={helpTab === 'selection'
                  ? 'https://www.youtube.com/embed/ZNt9jtfx9TY?autoplay=1'
                  : 'https://www.youtube.com/embed/a_AT7cEN_9I?autoplay=1'
                }
                title={helpTab === 'selection' ? 'How Selection Modes Work' : 'How Plannotator Works'}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
