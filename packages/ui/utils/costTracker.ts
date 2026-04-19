/**
 * Persistent per-day LLM cost tracker.
 *
 * Buckets spend by ISO date in localStorage so the pill can surface
 * "$X today" without server round-trips. Survives plannotator server
 * restarts (each plan invocation spawns a fresh server on a new port,
 * but the browser's localStorage persists across them).
 *
 * Days are ISO YYYY-MM-DD strings derived from the user's local time —
 * intentional, because budget feels like "today" not "today UTC".
 */

const PREFIX = 'plannotator-cost-';
const RED_TEAM_FALLBACK = 0.0015; // gpt-4.1-mini, ~1500 in + ~400 out

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${PREFIX}${y}-${m}-${day}`;
}

export function getTodayCost(): number {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function addCost(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return getTodayCost();
  const next = getTodayCost() + amount;
  try {
    localStorage.setItem(todayKey(), String(next));
  } catch {
    /* private browsing / quota exceeded — best effort */
  }
  return next;
}

/** Sum of cost over the last N days (defaults to 7). */
export function getCostOverDays(days = 7): number {
  let total = 0;
  try {
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const raw = localStorage.getItem(`${PREFIX}${y}-${m}-${day}`);
      if (raw) total += Number(raw) || 0;
    }
  } catch {
    /* ignore */
  }
  return total;
}

export const RED_TEAM_COST_ESTIMATE = RED_TEAM_FALLBACK;

/** Format a USD amount as a compact pill label. */
export function formatCost(amount: number): string {
  if (amount < 0.01) return '<$0.01';
  if (amount < 1) return `$${amount.toFixed(2)}`;
  if (amount < 10) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(1)}`;
}
