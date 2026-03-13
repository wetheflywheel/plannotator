import React from 'react';
import { StatusIcon, StatusButton } from './StatusButton';
import type { ChecklistItem, ChecklistItemStatus, ChecklistItemResult } from '@plannotator/shared/checklist-types';

interface CoverageTaskListProps {
  items: ChecklistItem[];
  categories: string[];
  groupedItems: Map<string, ChecklistItem[]>;
  selectedItemId: string | null;
  getResult: (id: string) => ChecklistItemResult;
  onSetStatus: (id: string, status: ChecklistItemStatus) => void;
  onSelectItem: (id: string) => void;
  compact?: boolean;
}

export const CoverageTaskList: React.FC<CoverageTaskListProps> = ({
  categories,
  groupedItems,
  selectedItemId,
  getResult,
  onSetStatus,
  onSelectItem,
  compact,
}) => {
  return (
    <div className="h-full overflow-y-auto py-2">
      {categories.map(category => {
        const items = groupedItems.get(category);
        if (!items) return null;

        return (
          <div key={category} className="mb-3">
            {/* Category header */}
            <div className="px-3 py-1">
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground/50">
                {category}
              </span>
            </div>

            {/* Items */}
            {items.map(item => {
              const result = getResult(item.id);
              const isSelected = selectedItemId === item.id;
              const diffCount = item.diffMap
                ? Object.values(item.diffMap).reduce((a, b) => a + b, 0)
                : 0;

              return (
                <div
                  key={item.id}
                  data-item-id={item.id}
                  onClick={() => onSelectItem(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-default transition-colors duration-100 ${
                    isSelected ? 'bg-muted/50' : 'hover:bg-muted/20'
                  }`}
                >
                  {/* Status dot */}
                  <StatusIcon status={result.status} className="w-4 h-4 shrink-0" />

                  {/* Check text */}
                  <span className="text-xs truncate flex-1 min-w-0 text-foreground/70">
                    {item.check}
                  </span>

                  {/* Diff count badge */}
                  {diffCount > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0 tabular-nums">
                      {diffCount}
                    </span>
                  )}

                  {/* Compact P/F/S actions */}
                  <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                    {(['passed', 'failed', 'skipped'] as const).map(s => (
                      <StatusButton
                        key={s}
                        status={s}
                        currentStatus={result.status}
                        onClick={() => onSetStatus(item.id, result.status === s ? 'pending' : s)}
                        size={compact ? 'xs' : 'sm'}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
