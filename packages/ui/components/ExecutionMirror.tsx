/**
 * ExecutionMirror — post-approve "watching" panel.
 *
 * Subscribes to /api/execution/stream (SSE) and renders a live feed of
 * git commits + file edits happening in the project cwd since approval.
 *
 * v0 scope: stream activity only. v1 will correlate commits with plan
 * checklist items.
 *
 * Wiring (in packages/editor/App.tsx):
 *   {submitted === 'approved' && <ExecutionMirror />}
 *
 * The component is self-contained — it manages its own EventSource
 * lifecycle and doesn't reach into App-level state. If the auto-close
 * countdown closes the tab, the mirror just unmounts; no special
 * coordination needed.
 */

import React, { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types — must mirror packages/server/execution-watch.ts
// ---------------------------------------------------------------------------

type CommitEvent = {
  type: 'commit';
  hash: string;
  shortHash: string;
  subject: string;
  /** ISO 8601 timestamp from `git log %aI`. */
  timestamp: string;
};

type EditEvent = {
  type: 'edit';
  /** Path relative to cwd, normalised to forward slashes. */
  path: string;
  /** ms since epoch — when this debounced edit was emitted. */
  timestamp: number;
};

type ExecutionEvent = CommitEvent | EditEvent;

type StreamFrame =
  | { type: 'snapshot'; events: ExecutionEvent[] }
  | ExecutionEvent;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render an ms-or-ISO timestamp as a short relative phrase. */
function relativeTime(ts: number | string): string {
  const then = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (!then || Number.isNaN(then)) return '';
  const now = Date.now();
  const diff = now - then;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1_000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(then).toLocaleDateString();
}

/** Sort key — commit timestamps come as ISO strings, edits as ms. */
function sortKey(e: ExecutionEvent): number {
  return typeof e.timestamp === 'number'
    ? e.timestamp
    : new Date(e.timestamp).getTime();
}

/** Stable per-event id for React keys. Hash uniquely identifies commits. */
function eventKey(e: ExecutionEvent): string {
  return e.type === 'commit'
    ? `commit:${e.hash}`
    : `edit:${e.path}:${e.timestamp}`;
}

/** Inline icons — no external dep, sized to match adjacent text. */
const CommitIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
    <circle cx="8" cy="8" r="3" />
    <path d="M2 8h3M11 8h3" strokeLinecap="round" />
  </svg>
);

const FileIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
    <path d="M3 2.5h6L13 6.5v7a1 1 0 01-1 1H3a1 1 0 01-1-1v-10a1 1 0 011-1z" strokeLinejoin="round" />
    <path d="M9 2.5V6h4" strokeLinejoin="round" />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ExecutionMirror: React.FC = () => {
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [connected, setConnected] = useState(false);

  // Tick state purely to re-render relative timestamps. We don't need
  // sub-second precision — once a minute is plenty for the "just now / Xs
  // ago / Xm ago" phrasing.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 5_000);
    return () => clearInterval(id);
  }, []);

  // Single mounted EventSource. We deliberately don't auto-reconnect on
  // close (browser EventSource does that for us by default), but if we
  // get a hard parsing error we tear down so the user sees the gray dot
  // rather than a stuck "connected" label on a dead stream.
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/execution/stream');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (msg) => {
      try {
        const frame = JSON.parse(msg.data) as StreamFrame;
        if (frame.type === 'snapshot') {
          // Replace local state with the server's bounded buffer. This
          // makes a refresh-after-approve idempotent — no risk of double
          // counting the same event across reconnects.
          setEvents(frame.events);
        } else {
          setEvents((prev) => {
            // Defensive de-dup — commits are uniquely identified by hash;
            // edits by (path, timestamp).
            const key = eventKey(frame);
            if (prev.some((e) => eventKey(e) === key)) return prev;
            // Cap client-side history to keep DOM small even if the
            // server snapshot grows.
            const next = [...prev, frame];
            return next.length > 250 ? next.slice(next.length - 250) : next;
          });
        }
      } catch {
        // Heartbeats arrive as `:` comments which the browser surfaces
        // as empty `data` lines — silently skip.
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  // Newest at top. Commits and edits intermix on a single timeline.
  const sorted = events.slice().sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <div className="w-full flex justify-center mb-4">
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-card border border-border rounded-lg p-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
              title={connected ? 'Live stream connected' : 'Disconnected'}
              aria-label={connected ? 'Connected' : 'Disconnected'}
            />
            <span className="text-sm font-medium text-foreground">Live activity</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              git commits and file edits in this project
            </span>
            <div className="flex-1" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 tabular-nums">
              {sorted.length === 0
                ? 'idle'
                : `${sorted.length} ${sorted.length === 1 ? 'event' : 'events'}`}
            </span>
          </div>

          {/* Body — scroll only the inner list, not the surrounding card */}
          <div
            className="rounded border border-border/60 bg-background/40 overflow-y-auto"
            style={{ maxHeight: 400 }}
          >
            {sorted.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                Waiting for activity...
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {sorted.map((e) => (
                  <li
                    key={eventKey(e)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs"
                  >
                    {e.type === 'commit' ? (
                      <>
                        <CommitIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                        <code className="font-mono text-[11px] text-primary tabular-nums shrink-0">
                          {e.shortHash}
                        </code>
                        <span className="text-foreground/90 truncate flex-1" title={e.subject}>
                          {e.subject || '(no subject)'}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {relativeTime(e.timestamp)}
                        </span>
                      </>
                    ) : (
                      <>
                        <FileIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <code
                          className="font-mono text-[11px] text-foreground/80 truncate flex-1"
                          title={e.path}
                        >
                          {e.path}
                        </code>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {relativeTime(e.timestamp)}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
