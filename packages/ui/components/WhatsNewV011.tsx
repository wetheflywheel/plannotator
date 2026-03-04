import React from 'react';
import { createPortal } from 'react-dom';
import { markWhatsNewSeen } from '../utils/whatsNew';

const RELEASE_URLS = {
  v0100: 'https://github.com/backnotprop/plannotator/releases/tag/v0.10.0',
  v0110: 'https://github.com/backnotprop/plannotator/releases/tag/v0.11.0',
};

interface WhatsNewV011Props {
  isOpen: boolean;
  onComplete: () => void;
}

export const WhatsNewV011: React.FC<WhatsNewV011Props> = ({
  isOpen,
  onComplete,
}) => {
  if (!isOpen) return null;

  const handleDismiss = () => {
    markWhatsNewSeen();
    onComplete();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-full flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/15">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <h3 className="font-semibold text-base">What's New in Plannotator</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Here's what's been added since your last update.
          </p>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto min-h-0">
          {/* Feature bullets */}
          <div className="space-y-3 text-sm text-foreground/90">
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5" />
              </div>
              <p>
                <span className="font-medium">Auto-save annotation drafts</span>{' '}
                <span className="text-muted-foreground">— Your annotations are now automatically saved in the background. If the browser refreshes or the server crashes, you'll be prompted to restore your work. Sorry it took so long to implement this.</span>
              </p>
            </div>
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              </div>
              <p>
                <span className="font-medium">Short link sharing</span>{' '}
                <span className="text-muted-foreground">— Share plans with shorter, more portable links that work across Slack and other platforms, with end-to-end encryption. Currently enabled for large plans that don't fit in the URL; we'll be rolling this out as the default soon.</span>
              </p>
            </div>
            <div className="flex gap-2.5">
              <div className="shrink-0 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5" />
              </div>
              <p>
                <span className="font-medium">Obsidian vault browser</span>{' '}
                <span className="text-muted-foreground">— For Obsidian users, we're building deeper integrations starting with the vault browser. Browse and annotate vault files directly during plan review. Toggle it on under Settings &gt; Saving &gt; Obsidian.</span>
              </p>
            </div>
          </div>

          {/* Release notes callout */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Plus many more improvements and bug fixes. See the full release notes:{' '}
            <a
              href={RELEASE_URLS.v0100}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              v0.10.0
            </a>
            {', '}
            <a
              href={RELEASE_URLS.v0110}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              v0.11.0
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
