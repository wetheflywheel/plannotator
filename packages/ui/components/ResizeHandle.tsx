import React from 'react';
import type { ResizeHandleProps as BaseProps } from '../hooks/useResizablePanel';

interface Props extends BaseProps {
  className?: string;
  /** Touch area extends rightward to avoid covering scrollbars on the right
   *  edge of the left-adjacent panel. 'right' uses zero left encroachment
   *  since the scrollbar is immediately adjacent; 'left' allows slight overlap. */
  side?: 'left' | 'right';
}

export const ResizeHandle: React.FC<Props> = ({
  isDragging,
  onMouseDown,
  onTouchStart,
  onDoubleClick,
  className,
  side,
}) => (
  <div
    className={`relative w-0 cursor-col-resize flex-shrink-0 group z-10${className ? ` ${className}` : ''}`}
  >
    {/* Visible track — 4px wide, centered on the zero-width layout box */}
    <div className={`absolute inset-y-0 -left-0.5 -right-0.5 transition-colors ${
      isDragging ? 'bg-primary/50' : 'group-hover:bg-border'
    }`} />
    {/* Wider touch area — extends away from adjacent scrollbar */}
    <div
      className={`absolute inset-y-0 ${
        side === 'left' ? '-right-2 -left-1' :
        side === 'right' ? '-right-3 left-0' :
        '-inset-x-2'
      }`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onDoubleClick={onDoubleClick}
    />
  </div>
);
