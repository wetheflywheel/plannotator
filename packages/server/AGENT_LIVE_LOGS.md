# Agent Live Logs — Design Notes

Follow-up to the Codex review agent integration. Surfaces stderr in real-time in the agent job detail panel.

## Problem

Stderr is drained continuously during job execution but only saved to `job.error` (last 500 chars) on non-zero exit. Users have no visibility into what the agent is doing while it runs.

## Approach: `job:log` SSE event

New SSE event type — does not modify `AgentJobInfo`, no Pi breakage, backward compatible (old clients ignore unknown events).

```typescript
| { type: "job:log"; jobId: string; delta: string }
```

### Server (`packages/server/agent-jobs.ts`)

In the stderr drain loop, buffer-and-flush at 200ms intervals:

```typescript
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
let logPending = "";

for await (const chunk of reader) {
  const text = decode(chunk);
  stderrBuf = (stderrBuf + text).slice(-500); // existing error capture
  logPending += text;

  if (!logFlushTimer) {
    logFlushTimer = setTimeout(() => {
      if (logPending) {
        broadcast({ type: "job:log", jobId: id, delta: logPending });
        logPending = "";
      }
      logFlushTimer = null;
    }, 200);
  }
}

// Flush remaining on stream close
if (logPending) {
  broadcast({ type: "job:log", jobId: id, delta: logPending });
}
```

Buffer-and-flush (not time-based throttle) ensures a single large stderr dump sends one event with all the content, and rapid small writes batch into fewer events.

### Shared types (`packages/shared/agent-jobs.ts`)

Add the new event variant to the union:

```typescript
export type AgentJobEvent =
  | { type: "snapshot"; jobs: AgentJobInfo[] }
  | { type: "job:started"; job: AgentJobInfo }
  | { type: "job:updated"; job: AgentJobInfo }
  | { type: "job:completed"; job: AgentJobInfo }
  | { type: "job:log"; jobId: string; delta: string }   // NEW
  | { type: "jobs:cleared" };
```

`AgentJobInfo` unchanged — no Pi mirror breakage.

### Client hook (`packages/ui/hooks/useAgentJobs.ts`)

Accumulate deltas in a parallel Map (same pattern as AI chat `text + msg.delta`):

```typescript
const [jobLogs, setJobLogs] = useState<Map<string, string>>(new Map());

// In SSE handler:
case 'job:log':
  setJobLogs(prev => {
    const next = new Map(prev);
    next.set(parsed.jobId, (prev.get(parsed.jobId) ?? '') + parsed.delta);
    return next;
  });
  break;
```

Expose `jobLogs` in the hook return value. No cap on accumulation — cap at the render layer.

### UI (`ReviewAgentJobDetailPanel.tsx`)

Replace the current stderr section with a live log view:

- While running: show `jobLogs.get(job.id)` in a scrollable monospace container
- On terminal state: show `jobLogs.get(job.id)` (full history) or fall back to `job.error` (for jobs that started before the SSE connection)
- Auto-scroll to bottom on new content (unless user has scrolled up — detect with scroll position check)
- No max-height cap on the log container (let it fill available space in the dockview panel)
- Max render window: if logs exceed ~50KB, trim from the top and show "[earlier output truncated]"

### Polling fallback

Clients using polling (SSE failure) won't receive `job:log` events. They still get `job.error` on completion. Live logs are a best-effort enhancement, not a guarantee.

### Performance notes

- React batches rapid `setJobLogs` calls automatically
- 200ms buffer-and-flush server-side prevents SSE flooding
- Map-based state avoids re-rendering unrelated job cards (only the detail panel for the active job re-renders)
- String concatenation is O(n) over the job lifetime but stderr output is typically small (< 100KB)
