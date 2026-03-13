import React, { useState } from 'react';
import { CoverageFileTree } from './CoverageFileTree';
import { CoverageTaskList } from './CoverageTaskList';
import { getCoverageLayout, saveCoverageLayout } from '@plannotator/ui/utils/uiPreferences';
import type { CoverageLayout } from '@plannotator/ui/utils/uiPreferences';
import type { CoverageData } from '../hooks/useChecklistCoverage';
import type { ChecklistItem, ChecklistItemStatus, ChecklistItemResult } from '@plannotator/shared/checklist-types';

interface CoverageViewProps {
  coverageData: CoverageData;
  items: ChecklistItem[];
  categories: string[];
  groupedItems: Map<string, ChecklistItem[]>;
  selectedItemId: string | null;
  getResult: (id: string) => ChecklistItemResult;
  onSetStatus: (id: string, status: ChecklistItemStatus) => void;
  onSelectItem: (id: string) => void;
}

const StackedIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <rect x="2" y="2" width="12" height="5" rx="1" />
    <rect x="2" y="9" width="12" height="5" rx="1" />
  </svg>
);

const SideBySideIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <rect x="2" y="2" width="5" height="12" rx="1" />
    <rect x="9" y="2" width="5" height="12" rx="1" />
  </svg>
);

export const CoverageView: React.FC<CoverageViewProps> = ({
  coverageData,
  items,
  categories,
  groupedItems,
  selectedItemId,
  getResult,
  onSetStatus,
  onSelectItem,
}) => {
  const [layout, setLayoutRaw] = useState<CoverageLayout>(getCoverageLayout);
  const setLayout = (l: CoverageLayout) => { setLayoutRaw(l); saveCoverageLayout(l); };
  const isSideBySide = layout === 'side-by-side';

  return (
    <div className="mt-4 bg-muted/50 rounded-lg p-3 border border-border/30">
      {/* Header: global progress + layout toggle */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono text-muted-foreground/60">
          {coverageData.globalCovered} / {coverageData.globalTotal} diffs covered
        </span>
        <span className={`text-xs font-mono font-medium ${
          coverageData.globalPercent === 100
            ? 'text-success'
            : coverageData.globalPercent > 0
              ? 'text-foreground/70'
              : 'text-muted-foreground/40'
        }`}>
          ({coverageData.globalPercent}%)
        </span>
        <div className="flex-1 h-1 bg-muted/50 rounded-full overflow-hidden max-w-32">
          <div
            className="h-full bg-success rounded-full transition-all duration-300"
            style={{ width: `${coverageData.globalPercent}%` }}
          />
        </div>

        {/* Layout toggle */}
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5 border border-border/30 ml-auto">
          <button
            onClick={() => setLayout('stacked')}
            className={`p-1 rounded transition-colors ${
              !isSideBySide ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Stacked layout"
          >
            <StackedIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setLayout('side-by-side')}
            className={`p-1 rounded transition-colors ${
              isSideBySide ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Side by side layout"
          >
            <SideBySideIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content: stacked or side-by-side */}
      <div className={isSideBySide ? 'flex gap-3' : ''}>
        {/* File tree */}
        <div className={`bg-card rounded-md border border-border/20 overflow-hidden ${isSideBySide ? 'flex-[3] min-w-0' : ''}`}>
          <CoverageFileTree tree={coverageData.tree} />
        </div>

        {/* Task list */}
        <div className={`bg-card rounded-md border border-border/20 overflow-hidden ${isSideBySide ? 'flex-[2] min-w-0' : 'mt-3'}`}>
          <CoverageTaskList
            items={items}
            categories={categories}
            groupedItems={groupedItems}
            selectedItemId={selectedItemId}
            getResult={getResult}
            onSetStatus={onSetStatus}
            onSelectItem={onSelectItem}
            compact={isSideBySide}
          />
        </div>
      </div>
    </div>
  );
};
