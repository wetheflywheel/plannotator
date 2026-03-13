import React from 'react';
import { ModeToggle } from '@plannotator/ui/components/ModeToggle';
import { Settings } from '@plannotator/ui/components/Settings';
import type { PlanWidth } from '@plannotator/ui/utils/uiPreferences';
import type { StatusCounts, SubmitState } from '../hooks/useChecklistProgress';
import type { ChecklistPR } from '@plannotator/shared/checklist-types';

declare const __APP_VERSION__: string;

// ---------------------------------------------------------------------------
// Provider icons (compact, monochrome-friendly)
// ---------------------------------------------------------------------------

// Icons sourced from repo root SVGs (GitHub.svg, GitLab.svg, Azure Devops.svg)
const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 128 128" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M64 5.103c-33.347 0-60.388 27.035-60.388 60.388 0 26.682 17.303 49.317 41.297 57.303 3.017.56 4.125-1.31 4.125-2.905 0-1.44-.056-6.197-.082-11.243-16.8 3.653-20.345-7.125-20.345-7.125-2.747-6.98-6.705-8.836-6.705-8.836-5.48-3.748.413-3.67.413-3.67 6.063.425 9.257 6.223 9.257 6.223 5.386 9.23 14.127 6.562 17.573 5.02.542-3.903 2.107-6.568 3.834-8.076-13.413-1.525-27.514-6.704-27.514-29.843 0-6.593 2.36-11.98 6.223-16.21-.628-1.52-2.695-7.662.584-15.98 0 0 5.07-1.623 16.61 6.19C53.7 35 58.867 34.327 64 34.304c5.13.023 10.3.694 15.127 2.033 11.526-7.813 16.59-6.19 16.59-6.19 3.287 8.317 1.22 14.46.593 15.98 3.872 4.23 6.215 9.617 6.215 16.21 0 23.194-14.127 28.3-27.574 29.796 2.167 1.874 4.097 5.55 4.097 11.183 0 8.08-.07 14.583-.07 16.572 0 1.607 1.088 3.49 4.148 2.897 23.98-7.994 41.263-30.622 41.263-57.294C124.388 32.14 97.35 5.104 64 5.104z" />
  </svg>
);

const GitLabIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 128 128" fill="currentColor">
    <path fill="#E24329" d="m124.755 51.382-.177-.452L107.47 6.282a4.459 4.459 0 0 0-1.761-2.121 4.581 4.581 0 0 0-5.236.281 4.578 4.578 0 0 0-1.518 2.304L87.404 42.088H40.629L29.077 6.746a4.492 4.492 0 0 0-1.518-2.31 4.581 4.581 0 0 0-5.236-.281 4.502 4.502 0 0 0-1.761 2.121L3.422 50.904l-.17.452c-5.059 13.219-.763 28.192 10.537 36.716l.059.046.157.111 26.061 19.516 12.893 9.758 7.854 5.93a5.283 5.283 0 0 0 6.388 0l7.854-5.93 12.893-9.758 26.218-19.634.065-.052c11.273-8.526 15.562-23.472 10.524-36.677z" />
    <path fill="#FC6D26" d="m124.755 51.382-.177-.452a57.79 57.79 0 0 0-23.005 10.341L64 89.682c12.795 9.68 23.934 18.09 23.934 18.09l26.218-19.634.065-.052c11.291-8.527 15.586-23.488 10.538-36.704z" />
    <path fill="#FCA326" d="m40.066 107.771 12.893 9.758 7.854 5.93a5.283 5.283 0 0 0 6.388 0l7.854-5.93 12.893-9.758s-11.152-8.436-23.947-18.09a18379.202 18379.202 0 0 0-23.935 18.09z" />
    <path fill="#FC6D26" d="M26.42 61.271A57.73 57.73 0 0 0 3.422 50.904l-.17.452c-5.059 13.219-.763 28.192 10.537 36.716l.059.046.157.111 26.061 19.516L64 89.655 26.42 61.271z" />
  </svg>
);

const AzureDevOpsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 128 128" fill="currentColor">
    <defs>
      <linearGradient id="ado-grad" gradientUnits="userSpaceOnUse" x1="64" y1="120.9" x2="64" y2="7.3">
        <stop offset="0" stopColor="#0078d4" />
        <stop offset="1" stopColor="#5ea0ef" />
      </linearGradient>
    </defs>
    <path fill="url(#ado-grad)" d="M120.89 28.445v69.262l-28.445 23.324-44.09-16.07v15.93L23.395 88.25l72.746 5.688V31.574ZM96.64 31.93 55.82 7.11v16.285L18.348 34.418 7.109 48.852v32.785l16.075 7.11V46.718Z" />
  </svg>
);

const ProviderIcon: React.FC<{ provider: ChecklistPR['provider']; className?: string }> = ({ provider, className }) => {
  switch (provider) {
    case 'github': return <GitHubIcon className={className} />;
    case 'gitlab': return <GitLabIcon className={className} />;
    case 'azure-devops': return <AzureDevOpsIcon className={className} />;
  }
};

// PR icon (from PR.svg in repo root)
export const PRIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 768 1024" fill="currentColor">
    <path d="M704 722s0-306 0-402-96-192-192-192c-64 0-64 0-64 0v-128l-192 192 192 192v-128s32 0 64 0 64 32 64 64 0 402 0 402c-38 22-64 63-64 110 0 71 57 128 128 128s128-57 128-128c0-47-26-88-64-110z m-64 174c-35 0-64-29-64-64s29-64 64-64 64 29 64 64-29 64-64 64z m-512-832c-71 0-128 57-128 128 0 47 26 88 64 110v419c-38 22-64 63-64 110 0 71 57 128 128 128s128-57 128-128c0-47-26-88-64-110v-419c38-22 64-63 64-110 0-71-57-128-128-128z m0 832c-35 0-64-29-64-64s29-64 64-64 64 29 64 64-29 64-64 64z m0-640c-35 0-64-29-64-64s29-64 64-64 64 29 64 64-29 64-64 64z" />
  </svg>
);

// ---------------------------------------------------------------------------
// Submit button
// ---------------------------------------------------------------------------

interface SubmitButtonProps {
  submitState: SubmitState;
  isSubmitting: boolean;
  onClick: () => void;
  counts: StatusCounts;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({
  submitState,
  isSubmitting,
  onClick,
  counts,
}) => {
  if (isSubmitting) {
    return (
      <button disabled className="px-3 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground opacity-50 cursor-not-allowed">
        Submitting...
      </button>
    );
  }

  switch (submitState) {
    case 'all-pending':
      return (
        <button disabled className="px-3 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground/50 cursor-not-allowed" title="Review at least one item">
          Submit Results
        </button>
      );
    case 'partial':
      return (
        <button
          onClick={onClick}
          className="px-3 py-1 rounded-md text-xs font-medium bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25 transition-colors"
          title={`${counts.pending} item${counts.pending !== 1 ? 's' : ''} still pending`}
        >
          Submit Partial Results
        </button>
      );
    case 'all-reviewed-with-failures':
      return (
        <button
          onClick={onClick}
          className="px-3 py-1 rounded-md text-xs font-medium bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition-colors"
        >
          Submit Results
        </button>
      );
    case 'all-passed':
      return (
        <button
          onClick={onClick}
          className="px-3 py-1 rounded-md text-xs font-medium bg-success text-success-foreground hover:opacity-90 transition-colors"
        >
          Submit Results
        </button>
      );
  }
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface ChecklistHeaderProps {
  title: string;
  origin: string | null;
  pr?: ChecklistPR;
  counts: StatusCounts;
  submitState: SubmitState;
  isSubmitting: boolean;
  onSubmit: () => void;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  checklistWidth: PlanWidth;
  onChecklistWidthChange: (width: PlanWidth) => void;
}

export const ChecklistHeader: React.FC<ChecklistHeaderProps> = ({
  title,
  origin,
  pr,
  counts,
  submitState,
  isSubmitting,
  onSubmit,
  isPanelOpen,
  onTogglePanel,
  checklistWidth,
  onChecklistWidthChange,
}) => (
  <header className="h-12 flex items-center justify-between px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-50 flex-shrink-0">
    {/* Left side */}
    <div className="flex items-center gap-2 min-w-0">
      <a
        href="https://github.com/backnotprop/plannotator"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity flex-shrink-0"
      >
        <span className="text-sm font-semibold tracking-tight">Plannotator</span>
      </a>
      <a
        href="https://github.com/backnotprop/plannotator/releases"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground font-mono opacity-60 hidden md:inline hover:opacity-100 transition-opacity flex-shrink-0"
      >
        v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}
      </a>
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-primary/15 text-primary hidden md:inline flex-shrink-0">
        QA Checklist
      </span>
      {origin && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium hidden md:inline flex-shrink-0 ${
          origin === 'claude-code'
            ? 'bg-orange-500/15 text-orange-400'
            : origin === 'pi'
              ? 'bg-violet-500/15 text-violet-400'
              : 'bg-zinc-500/20 text-zinc-400'
        }`}>
          {origin === 'claude-code' ? 'Claude Code' : origin === 'pi' ? 'Pi' : 'OpenCode'}
        </span>
      )}

      {/* PR link replaces title; fallback to title text */}
      <span className="text-muted-foreground/40 hidden md:inline flex-shrink-0">|</span>
      {pr ? (
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors hidden md:flex min-w-0"
          title={pr.title || `PR #${pr.number}`}
        >
          <PRIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <ProviderIcon provider={pr.provider} className="w-3 h-3 flex-shrink-0 opacity-60" />
          <span className="font-mono">#{pr.number}</span>
          {pr.branch && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="font-mono truncate max-w-[160px]">{pr.branch}</span>
            </>
          )}
        </a>
      ) : (
        <span className="text-xs text-muted-foreground/60 hidden md:inline truncate" title={title}>
          {title}
        </span>
      )}
    </div>

    {/* Right side */}
    <div className="flex items-center gap-2 flex-shrink-0">
      {origin && (
        <SubmitButton
          submitState={submitState}
          isSubmitting={isSubmitting}
          onClick={onSubmit}
          counts={counts}
        />
      )}
      <div className="w-px h-5 bg-border/50 mx-0.5 hidden md:block" />
      <ModeToggle />
      <Settings
        taterMode={false}
        onTaterModeChange={() => {}}
        onIdentityChange={() => {}}
        origin={origin}
        mode="checklist"
        checklistWidth={checklistWidth}
        onChecklistWidthChange={onChecklistWidthChange}
      />
      {/* Panel toggle */}
      <button
        onClick={onTogglePanel}
        className={`p-1.5 rounded-md transition-colors ${
          isPanelOpen
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
        title={isPanelOpen ? 'Hide notes panel' : 'Show notes panel'}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      </button>
    </div>
  </header>
);
