/**
 * PlanCleanDiffView — Rendered/clean diff mode (P1 style)
 *
 * Shows the new plan content rendered as markdown, with colored left borders
 * indicating what changed:
 * - Green: added content
 * - Red: removed content (with strikethrough)
 * - Modified: old content (red, struck through) above new content (green)
 * - Unchanged: normal rendering, slightly dimmed
 *
 * Supports annotation via web-highlighter — same pattern as Viewer.tsx.
 * Reuses parseMarkdownToBlocks() for rendering consistency with the plan view.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import hljs from "highlight.js";
import Highlighter from "@plannotator/web-highlighter";
import { parseMarkdownToBlocks } from "../../utils/parser";
import { getIdentity } from "../../utils/identity";
import type { Block, Annotation, EditorMode, ImageAttachment } from "../../types";
import { AnnotationType } from "../../types";
import type { PlanDiffBlock } from "../../utils/planDiffEngine";
import type { QuickLabel } from "../../utils/quickLabels";
import { AnnotationToolbar } from "../AnnotationToolbar";
import { CommentPopover } from "../CommentPopover";
import { FloatingQuickLabelPicker } from "../FloatingQuickLabelPicker";

interface PlanCleanDiffViewProps {
  blocks: PlanDiffBlock[];
  // Annotation props (all optional for backwards compat)
  annotations?: Annotation[];
  onAddAnnotation?: (ann: Annotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  selectedAnnotationId?: string | null;
  mode?: EditorMode;
}

export const PlanCleanDiffView: React.FC<PlanCleanDiffViewProps> = ({
  blocks,
  annotations,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
  mode = "selection",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlighterRef = useRef<Highlighter | null>(null);
  const modeRef = useRef<EditorMode>(mode);
  const onAddAnnotationRef = useRef(onAddAnnotation);
  const pendingSourceRef = useRef<any>(null);
  const justCreatedIdRef = useRef<string | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [toolbarState, setToolbarState] = useState<{
    element: HTMLElement;
    source: any;
    selectionText: string;
  } | null>(null);

  const [commentPopover, setCommentPopover] = useState<{
    anchorEl: HTMLElement;
    contextText: string;
    initialText?: string;
    isGlobal: boolean;
    source?: any;
  } | null>(null);

  const [quickLabelPicker, setQuickLabelPicker] = useState<{
    anchorEl: HTMLElement;
    cursorHint?: { x: number; y: number };
    source?: any;
  } | null>(null);

  // Keep refs in sync
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { onAddAnnotationRef.current = onAddAnnotation; }, [onAddAnnotation]);

  // Track mouse position for quick label picker
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Resolve diff context from DOM — walks up to find data-diff-type
  const resolveDiffContext = (el: HTMLElement): Annotation["diffContext"] => {
    let node: HTMLElement | null = el;
    while (node && node !== containerRef.current) {
      const dt = node.dataset.diffType;
      if (dt === "added" || dt === "removed" || dt === "modified") return dt;
      node = node.parentElement;
    }
    return undefined;
  };

  // Create annotation from web-highlighter source
  const createAnnotationFromSource = (
    highlighter: Highlighter,
    source: any,
    type: AnnotationType,
    text?: string,
    images?: ImageAttachment[],
    isQuickLabel?: boolean,
    quickLabelTip?: string,
  ) => {
    const doms = highlighter.getDoms(source.id);
    let blockId = "";
    let startOffset = 0;
    let diffContext: Annotation["diffContext"];

    if (doms?.length > 0) {
      const el = doms[0] as HTMLElement;
      // Walk up to find data-block-id
      let parent = el.parentElement;
      while (parent && !parent.dataset.blockId) {
        parent = parent.parentElement;
      }
      if (parent?.dataset.blockId) {
        blockId = parent.dataset.blockId;
        const blockText = parent.textContent || "";
        const beforeText = blockText.split(source.text)[0];
        startOffset = beforeText?.length || 0;
      }
      // Resolve diff context
      diffContext = resolveDiffContext(el);
    }

    const newAnnotation: Annotation = {
      id: source.id,
      blockId,
      startOffset,
      endOffset: startOffset + source.text.length,
      type,
      text,
      originalText: source.text,
      createdA: Date.now(),
      author: getIdentity(),
      startMeta: source.startMeta,
      endMeta: source.endMeta,
      images,
      ...(isQuickLabel ? { isQuickLabel: true } : {}),
      ...(quickLabelTip ? { quickLabelTip } : {}),
      ...(diffContext ? { diffContext } : {}),
    };

    if (type === AnnotationType.DELETION) {
      highlighter.addClass("deletion", source.id);
    } else if (type === AnnotationType.COMMENT) {
      highlighter.addClass("comment", source.id);
    }

    justCreatedIdRef.current = newAnnotation.id;
    onAddAnnotationRef.current?.(newAnnotation);
  };

  // Initialize web-highlighter
  useEffect(() => {
    if (!containerRef.current || !onAddAnnotation) return;

    const highlighter = new Highlighter({
      $root: containerRef.current,
      exceptSelectors: [".annotation-toolbar", "button"],
      wrapTag: "mark",
      style: { className: "annotation-highlight" },
    });

    highlighterRef.current = highlighter;

    highlighter.on(Highlighter.event.CREATE, ({ sources }: { sources: any[] }) => {
      if (sources.length > 0) {
        const source = sources[0];
        const doms = highlighter.getDoms(source.id);
        if (doms?.length > 0) {
          // Clean up previous pending
          if (pendingSourceRef.current) {
            highlighter.remove(pendingSourceRef.current.id);
            pendingSourceRef.current = null;
          }
          setCommentPopover(null);
          setQuickLabelPicker(null);

          if (modeRef.current === "redline") {
            createAnnotationFromSource(highlighter, source, AnnotationType.DELETION);
            window.getSelection()?.removeAllRanges();
          } else if (modeRef.current === "comment") {
            pendingSourceRef.current = source;
            setCommentPopover({
              anchorEl: doms[0] as HTMLElement,
              contextText: source.text.slice(0, 80),
              isGlobal: false,
              source,
            });
          } else if (modeRef.current === "quickLabel") {
            pendingSourceRef.current = source;
            setQuickLabelPicker({
              anchorEl: doms[0] as HTMLElement,
              cursorHint: lastMousePosRef.current,
              source,
            });
          } else {
            // Selection mode — show toolbar
            pendingSourceRef.current = source;
            setToolbarState({
              element: doms[0] as HTMLElement,
              source,
              selectionText: source.text,
            });
          }
        }
      }
    });

    highlighter.on(Highlighter.event.CLICK, ({ id }: { id: string }) => {
      onSelectAnnotation?.(id);
    });

    highlighter.run();

    // Mobile bridge
    const isTouchPrimary = window.matchMedia("(pointer: coarse)").matches;
    let selectionTimer: ReturnType<typeof setTimeout>;
    const handleSelectionChange = isTouchPrimary
      ? () => {
          clearTimeout(selectionTimer);
          selectionTimer = setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
            if (!containerRef.current?.contains(sel.anchorNode)) return;
            highlighter.fromRange(sel.getRangeAt(0));
          }, 400);
        }
      : null;

    if (handleSelectionChange) {
      document.addEventListener("selectionchange", handleSelectionChange);
    }

    return () => {
      if (handleSelectionChange) {
        clearTimeout(selectionTimer);
        document.removeEventListener("selectionchange", handleSelectionChange);
      }
      highlighter.dispose();
    };
  }, [onAddAnnotation, onSelectAnnotation]);

  // Apply CSS classes to existing annotations
  useEffect(() => {
    const highlighter = highlighterRef.current;
    if (!highlighter || !annotations) return;

    annotations.forEach((ann) => {
      try {
        const doms = highlighter.getDoms(ann.id);
        if (doms && doms.length > 0) {
          if (ann.type === AnnotationType.DELETION) {
            highlighter.addClass("deletion", ann.id);
          } else if (ann.type === AnnotationType.COMMENT) {
            highlighter.addClass("comment", ann.id);
          }
        }
      } catch {}
    });
  }, [annotations]);

  // Scroll to selected annotation
  useEffect(() => {
    if (!selectedAnnotationId || !containerRef.current) return;

    // Skip scroll if we just created this annotation
    if (justCreatedIdRef.current === selectedAnnotationId) {
      justCreatedIdRef.current = null;
      return;
    }

    const highlighter = highlighterRef.current;
    let targetElements: Element[] = [];

    if (highlighter) {
      try {
        const doms = highlighter.getDoms(selectedAnnotationId);
        if (doms && doms.length > 0) targetElements = Array.from(doms);
      } catch {}
    }

    if (targetElements.length === 0) {
      const manualMarks = containerRef.current.querySelectorAll(
        `[data-bind-id="${selectedAnnotationId}"]`
      );
      if (manualMarks.length > 0) targetElements = Array.from(manualMarks);
    }

    if (targetElements.length === 0) return;

    targetElements.forEach((el) => el.classList.add("focused"));
    targetElements[0].scrollIntoView({ behavior: "smooth", block: "center" });

    // Remove focused class after animation
    const timer = setTimeout(() => {
      targetElements.forEach((el) => el.classList.remove("focused"));
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedAnnotationId]);

  // Toolbar handlers
  const handleAnnotate = (type: AnnotationType) => {
    const highlighter = highlighterRef.current;
    if (!toolbarState || !highlighter) return;
    createAnnotationFromSource(highlighter, toolbarState.source, type);
    pendingSourceRef.current = null;
    setToolbarState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleQuickLabel = (label: QuickLabel) => {
    const highlighter = highlighterRef.current;
    if (!toolbarState || !highlighter) return;
    createAnnotationFromSource(
      highlighter, toolbarState.source, AnnotationType.COMMENT,
      `${label.emoji} ${label.text}`, undefined, true, label.tip
    );
    pendingSourceRef.current = null;
    setToolbarState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleToolbarClose = () => {
    if (toolbarState && highlighterRef.current) {
      highlighterRef.current.remove(toolbarState.source.id);
    }
    pendingSourceRef.current = null;
    setToolbarState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleRequestComment = (initialChar?: string) => {
    if (!toolbarState) return;
    setCommentPopover({
      anchorEl: toolbarState.element,
      contextText: toolbarState.selectionText.slice(0, 80),
      initialText: initialChar,
      isGlobal: false,
      source: toolbarState.source,
    });
    setToolbarState(null);
  };

  const handleCommentSubmit = (text: string, images?: ImageAttachment[]) => {
    if (!commentPopover) return;
    if (commentPopover.source && highlighterRef.current) {
      createAnnotationFromSource(
        highlighterRef.current, commentPopover.source,
        AnnotationType.COMMENT, text, images
      );
      pendingSourceRef.current = null;
      window.getSelection()?.removeAllRanges();
    }
    setCommentPopover(null);
  };

  const handleCommentClose = useCallback(() => {
    setCommentPopover((prev) => {
      if (prev?.source && highlighterRef.current) {
        highlighterRef.current.remove(prev.source.id);
        pendingSourceRef.current = null;
      }
      return null;
    });
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleFloatingQuickLabel = useCallback((label: QuickLabel) => {
    if (!quickLabelPicker?.source || !highlighterRef.current) return;
    createAnnotationFromSource(
      highlighterRef.current, quickLabelPicker.source, AnnotationType.COMMENT,
      `${label.emoji} ${label.text}`, undefined, true, label.tip
    );
    pendingSourceRef.current = null;
    setQuickLabelPicker(null);
    window.getSelection()?.removeAllRanges();
  }, [quickLabelPicker]);

  const handleQuickLabelPickerDismiss = useCallback(() => {
    if (quickLabelPicker?.source && highlighterRef.current) {
      highlighterRef.current.remove(quickLabelPicker.source.id);
      pendingSourceRef.current = null;
    }
    setQuickLabelPicker(null);
    window.getSelection()?.removeAllRanges();
  }, [quickLabelPicker]);

  return (
    <div ref={containerRef} className="space-y-1">
      {blocks.map((block, index) => (
        <DiffBlockRenderer key={index} block={block} />
      ))}

      {/* Text selection toolbar */}
      {toolbarState && (
        <AnnotationToolbar
          element={toolbarState.element}
          positionMode="center-above"
          onAnnotate={handleAnnotate}
          onClose={handleToolbarClose}
          onRequestComment={handleRequestComment}
          onQuickLabel={handleQuickLabel}
          copyText={toolbarState.selectionText}
          closeOnScrollOut
        />
      )}

      {/* Comment popover */}
      {commentPopover && (
        <CommentPopover
          anchorEl={commentPopover.anchorEl}
          contextText={commentPopover.contextText}
          isGlobal={commentPopover.isGlobal}
          initialText={commentPopover.initialText}
          onSubmit={handleCommentSubmit}
          onClose={handleCommentClose}
        />
      )}

      {/* Quick label picker */}
      {quickLabelPicker && (
        <FloatingQuickLabelPicker
          anchorEl={quickLabelPicker.anchorEl}
          cursorHint={quickLabelPicker.cursorHint}
          onSelect={handleFloatingQuickLabel}
          onDismiss={handleQuickLabelPickerDismiss}
        />
      )}
    </div>
  );
};

const DiffBlockRenderer: React.FC<{ block: PlanDiffBlock }> = ({ block }) => {
  switch (block.type) {
    case "unchanged":
      return (
        <div className="plan-diff-unchanged opacity-60 hover:opacity-100 transition-opacity" data-diff-type="unchanged">
          <MarkdownChunk content={block.content} />
        </div>
      );

    case "added":
      return (
        <div className="plan-diff-added" data-diff-type="added">
          <MarkdownChunk content={block.content} />
        </div>
      );

    case "removed":
      return (
        <div className="plan-diff-removed line-through decoration-destructive/30 opacity-70" data-diff-type="removed">
          <MarkdownChunk content={block.content} />
        </div>
      );

    case "modified":
      return (
        <div>
          <div className="plan-diff-removed line-through decoration-destructive/30 opacity-60" data-diff-type="removed">
            <MarkdownChunk content={block.oldContent!} />
          </div>
          <div className="plan-diff-added" data-diff-type="modified">
            <MarkdownChunk content={block.content} />
          </div>
        </div>
      );

    default:
      return null;
  }
};

/**
 * Renders a markdown string chunk using parseMarkdownToBlocks + simplified block rendering.
 * Reuses the same visual output as the Viewer component.
 */
const MarkdownChunk: React.FC<{ content: string }> = ({ content }) => {
  const blocks = React.useMemo(
    () => parseMarkdownToBlocks(content),
    [content]
  );

  return (
    <>
      {blocks.map((block) => (
        <SimpleBlockRenderer key={block.id} block={block} />
      ))}
    </>
  );
};

/**
 * Simplified block renderer — same visual output as Viewer's BlockRenderer
 * but without code block hover, mermaid, or linked doc support.
 * Adds data-block-id for annotation anchoring.
 */
const SimpleBlockRenderer: React.FC<{ block: Block }> = ({ block }) => {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level || 1}` as keyof React.JSX.IntrinsicElements;
      const styles =
        {
          1: "text-2xl font-bold mb-4 mt-6 first:mt-0 tracking-tight",
          2: "text-xl font-semibold mb-3 mt-8 text-foreground/90",
          3: "text-base font-semibold mb-2 mt-6 text-foreground/80",
        }[block.level || 1] || "text-base font-semibold mb-2 mt-4";

      return (
        <Tag className={styles} data-block-id={block.id}>
          <InlineMarkdown text={block.content} />
        </Tag>
      );
    }

    case "blockquote":
      return (
        <blockquote className="border-l-2 border-primary/50 pl-4 my-4 text-muted-foreground italic" data-block-id={block.id}>
          <InlineMarkdown text={block.content} />
        </blockquote>
      );

    case "list-item": {
      const indent = (block.level || 0) * 1.25;
      const isCheckbox = block.checked !== undefined;
      return (
        <div
          className="flex gap-3 my-1.5"
          style={{ marginLeft: `${indent}rem` }}
          data-block-id={block.id}
        >
          <span className="select-none shrink-0 flex items-center">
            {isCheckbox ? (
              block.checked ? (
                <svg
                  className="w-4 h-4 text-success"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 text-muted-foreground/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="12" cy="12" r="9" />
                </svg>
              )
            ) : (
              <span className="text-primary/60">
                {(block.level || 0) === 0
                  ? "\u2022"
                  : (block.level || 0) === 1
                    ? "\u25E6"
                    : "\u25AA"}
              </span>
            )}
          </span>
          <span
            className={`text-sm leading-relaxed ${isCheckbox && block.checked ? "text-muted-foreground line-through" : "text-foreground/90"}`}
          >
            <InlineMarkdown text={block.content} />
          </span>
        </div>
      );
    }

    case "code":
      return <SimpleCodeBlock block={block} />;

    case "hr":
      return <hr className="border-border/30 my-8" />;

    case "table": {
      const lines = block.content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return null;
      const parseRow = (line: string): string[] =>
        line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      const headers = parseRow(lines[0]);
      const rows: string[][] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^[\|\-:\s]+$/.test(line)) continue;
        rows.push(parseRow(line));
      }
      return (
        <div className="my-4 overflow-x-auto" data-block-id={block.id}>
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                {headers.map((header, i) => (
                  <th key={i} className="px-3 py-2 text-left font-semibold text-foreground/90 bg-muted/30">
                    <InlineMarkdown text={header} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-border/50">
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 text-foreground/80">
                      <InlineMarkdown text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    default:
      return (
        <p className="mb-4 leading-relaxed text-foreground/90 text-[15px]" data-block-id={block.id}>
          <InlineMarkdown text={block.content} />
        </p>
      );
  }
};

/**
 * Simplified code block with syntax highlighting (no hover/copy toolbar).
 */
const SimpleCodeBlock: React.FC<{ block: Block }> = ({ block }) => {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      codeRef.current.className = `hljs font-mono${block.language ? ` language-${block.language}` : ""}`;
      hljs.highlightElement(codeRef.current);
    }
  }, [block.content, block.language]);

  return (
    <div className="relative group my-5" data-block-id={block.id}>
      <pre className="bg-muted/50 border border-border/30 rounded-lg overflow-x-auto">
        <code
          ref={codeRef}
          className={`hljs font-mono${block.language ? ` language-${block.language}` : ""}`}
        >
          {block.content}
        </code>
      </pre>
      {block.language && (
        <span className="absolute top-2 right-2 text-[9px] font-mono text-muted-foreground/50">
          {block.language}
        </span>
      )}
    </div>
  );
};

/**
 * Inline markdown renderer — handles bold, italic, inline code, links.
 * Duplicated from Viewer for self-containment.
 */
const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let match = remaining.match(/^\*\*(.+?)\*\*/);
    if (match) {
      parts.push(
        <strong key={key++} className="font-semibold">
          <InlineMarkdown text={match[1]} />
        </strong>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^\*(.+?)\*/);
    if (match) {
      parts.push(<em key={key++}><InlineMarkdown text={match[1]} /></em>);
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono"
        >
          {match[1]}
        </code>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    match = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      parts.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {match[1]}
        </a>
      );
      remaining = remaining.slice(match[0].length);
      continue;
    }

    const nextSpecial = remaining.slice(1).search(/[*`[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else {
      parts.push(remaining.slice(0, nextSpecial + 1));
      remaining = remaining.slice(nextSpecial + 1);
    }
  }

  return <>{parts}</>;
};
