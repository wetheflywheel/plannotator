import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

/**
 * Phases for the auto-review state machine.
 *
 * - `idle`: nothing running, no countdown visible.
 * - `countdown`: pre-deliberation countdown ticking down.
 * - `paused`: user paused the countdown (or auto-paused via annotations).
 * - `deliberating`: council.py is running, streaming log events.
 * - `applying`: deliberation finished, OpenRouter is rewriting the plan.
 * - `approval_countdown`: plan revised, counting down to auto-approve.
 * - `approval_paused`: approval countdown paused.
 * - `error`: something failed; `errorMsg` and the last log lines explain why.
 * - `done`: flow completed (either auto-approved or user dismissed).
 */
export type AutoReviewPhase =
  | 'idle'
  | 'countdown'
  | 'paused'
  | 'deliberating'
  | 'applying'
  | 'approval_countdown'
  | 'approval_paused'
  | 'error'
  | 'done';

/** One line of streamed output from council.py (or a synthetic system/error entry). */
export interface LogEntry {
  /** Unix ms timestamp when the entry was received. */
  ts: number;
  /** Severity bucket — drives color in the console. */
  level: 'info' | 'ok' | 'error' | 'system';
  /** Raw text with any leading emoji/marker stripped. */
  text: string;
}

/** Per-model metadata captured from the structured result. */
export interface ReviewModelMeta {
  name: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}

/** Summary of a completed multi-LLM run, surfaced in the banner and drawer. */
export interface ReviewMeta {
  models: ReviewModelMeta[];
  synthesizer?: { modelId: string; inputTokens: number; outputTokens: number };
  totalDurationMs: number;
  estimatedCost: number;
}

/** +N / −M stats derived from `computePlanDiff` after apply-review succeeds. */
export interface DiffStats {
  additions: number;
  deletions: number;
}

// ---------- reducer state ----------

interface AutoReviewState {
  phase: AutoReviewPhase;
  /** Countdown seconds remaining for `countdown` / `approval_countdown`. */
  secondsLeft: number;
  /** Streamed log lines from the current (or most recent) deliberation. */
  logLines: LogEntry[];
  /** Consensus feedback text from council.py, set when the result event arrives. */
  consensusText: string;
  /** Diff summary computed after `/api/apply-review` succeeds. */
  diffStats: DiffStats | null;
  /** Completed review metadata (set by the pill right after apply succeeds). */
  meta: ReviewMeta | null;
  /** Error message for `phase === 'error'`. */
  errorMsg: string;
  /** Whether the console drawer is currently visible. */
  isDrawerOpen: boolean;
  /** Whether just the log pane is collapsed (summary sections still visible). */
  isLogCollapsed: boolean;
}

type Action =
  | { type: 'set_phase'; phase: AutoReviewPhase }
  | { type: 'set_seconds'; seconds: number }
  | {
      // Atomic (phase + seconds) transition. Used when starting a countdown
      // phase, because a two-step `set_phase` + `set_seconds` can race the
      // "countdown hit 0" transition effect in the pill.
      type: 'begin_countdown';
      phase: 'countdown' | 'approval_countdown';
      seconds: number;
    }
  | { type: 'tick' }
  | { type: 'append_log'; entry: LogEntry }
  | { type: 'clear_log' }
  | { type: 'set_consensus'; text: string }
  | { type: 'set_diff_stats'; stats: DiffStats | null }
  | { type: 'set_meta'; meta: ReviewMeta | null }
  | { type: 'set_error'; msg: string }
  | { type: 'reset_for_new_run' }
  | { type: 'open_drawer' }
  | { type: 'close_drawer' }
  | { type: 'toggle_drawer' }
  | { type: 'toggle_log_collapsed' };

const initialState: AutoReviewState = {
  phase: 'idle',
  secondsLeft: 0,
  logLines: [],
  consensusText: '',
  diffStats: null,
  meta: null,
  errorMsg: '',
  isDrawerOpen: false,
  isLogCollapsed: false,
};

function reducer(state: AutoReviewState, action: Action): AutoReviewState {
  switch (action.type) {
    case 'set_phase':
      return { ...state, phase: action.phase };
    case 'set_seconds':
      return { ...state, secondsLeft: action.seconds };
    case 'begin_countdown':
      return { ...state, phase: action.phase, secondsLeft: action.seconds };
    case 'tick':
      return { ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) };
    case 'append_log':
      return { ...state, logLines: [...state.logLines, action.entry] };
    case 'clear_log':
      return { ...state, logLines: [] };
    case 'set_consensus':
      return { ...state, consensusText: action.text };
    case 'set_diff_stats':
      return { ...state, diffStats: action.stats };
    case 'set_meta':
      return { ...state, meta: action.meta };
    case 'set_error':
      return { ...state, errorMsg: action.msg };
    case 'reset_for_new_run':
      // Wipe everything that's scoped to a single deliberation cycle.
      // Keeps meta/diff/consensus from a prior run from leaking into the next one.
      return {
        ...state,
        logLines: [],
        consensusText: '',
        diffStats: null,
        meta: null,
        errorMsg: '',
        isLogCollapsed: false,
      };
    case 'open_drawer':
      return { ...state, isDrawerOpen: true };
    case 'close_drawer':
      return { ...state, isDrawerOpen: false };
    case 'toggle_drawer':
      return { ...state, isDrawerOpen: !state.isDrawerOpen };
    case 'toggle_log_collapsed':
      return { ...state, isLogCollapsed: !state.isLogCollapsed };
    default:
      return state;
  }
}

// ---------- parseLogLine ----------

/**
 * Parse a single raw log line from council.py stderr into a structured entry.
 *
 * Detects leading status markers so the console can color-code lines without
 * re-parsing the emoji on every render:
 *   - `✓` / `✅` → level: 'ok'
 *   - `❌` / `Error:` prefix → level: 'error'
 *   - everything else → level: 'info'
 *
 * The marker is stripped from the returned `text` so the drawer can prefix
 * its own icon consistently.
 */
export function parseLogLine(raw: string): LogEntry {
  const text = (raw || '').trim();
  const ts = Date.now();

  if (!text) return { ts, level: 'info', text: '' };

  // Ok markers
  if (text.startsWith('✓') || text.startsWith('✅')) {
    return { ts, level: 'ok', text: text.replace(/^[✓✅]\s*/, '') };
  }
  // Error markers
  if (text.startsWith('❌') || /^Error[:\s]/i.test(text)) {
    return { ts, level: 'error', text: text.replace(/^❌\s*/, '') };
  }
  // Everything else
  return { ts, level: 'info', text };
}

// ---------- context + hook ----------

interface AutoReviewActions {
  setPhase: (phase: AutoReviewPhase) => void;
  setSeconds: (seconds: number) => void;
  beginCountdown: (phase: 'countdown' | 'approval_countdown', seconds: number) => void;
  tick: () => void;
  appendLog: (entry: LogEntry) => void;
  appendLogRaw: (raw: string) => void;
  clearLog: () => void;
  setConsensus: (text: string) => void;
  setDiffStats: (stats: DiffStats | null) => void;
  setMeta: (meta: ReviewMeta | null) => void;
  setError: (msg: string) => void;
  resetForNewRun: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  toggleLogCollapsed: () => void;
}

interface AutoReviewContextValue extends AutoReviewState {
  actions: AutoReviewActions;
}

const AutoReviewContext = createContext<AutoReviewContextValue | null>(null);

export const AutoReviewProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = useMemo<AutoReviewActions>(
    () => ({
      setPhase: (phase) => dispatch({ type: 'set_phase', phase }),
      setSeconds: (seconds) => dispatch({ type: 'set_seconds', seconds }),
      beginCountdown: (phase, seconds) =>
        dispatch({ type: 'begin_countdown', phase, seconds }),
      tick: () => dispatch({ type: 'tick' }),
      appendLog: (entry) => dispatch({ type: 'append_log', entry }),
      appendLogRaw: (raw) => dispatch({ type: 'append_log', entry: parseLogLine(raw) }),
      clearLog: () => dispatch({ type: 'clear_log' }),
      setConsensus: (text) => dispatch({ type: 'set_consensus', text }),
      setDiffStats: (stats) => dispatch({ type: 'set_diff_stats', stats }),
      setMeta: (meta) => dispatch({ type: 'set_meta', meta }),
      setError: (msg) => dispatch({ type: 'set_error', msg }),
      resetForNewRun: () => dispatch({ type: 'reset_for_new_run' }),
      openDrawer: () => dispatch({ type: 'open_drawer' }),
      closeDrawer: () => dispatch({ type: 'close_drawer' }),
      toggleDrawer: () => dispatch({ type: 'toggle_drawer' }),
      toggleLogCollapsed: () => dispatch({ type: 'toggle_log_collapsed' }),
    }),
    [],
  );

  const value = useMemo<AutoReviewContextValue>(
    () => ({ ...state, actions }),
    [state, actions],
  );

  return <AutoReviewContext.Provider value={value}>{children}</AutoReviewContext.Provider>;
};

/**
 * Subscribe to the shared auto-review state. Throws if called outside a provider
 * — that's intentional so missing-provider bugs surface immediately during dev.
 */
export function useAutoReview(): AutoReviewContextValue {
  const ctx = useContext(AutoReviewContext);
  if (!ctx) {
    throw new Error('useAutoReview must be used within an AutoReviewProvider');
  }
  return ctx;
}
