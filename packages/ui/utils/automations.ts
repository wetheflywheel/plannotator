/**
 * Automations — client-side API for managing automations
 *
 * Fetches from server endpoints instead of cookies. Server handles
 * persistence (AUTOMATION.md files on disk) and library merging.
 *
 * Two automation types:
 * - smart-action: fires immediately, sends feedback to agent
 * - prompt-hook: toggleable, appends to next approve/deny
 */

export type AutomationContext = 'plan' | 'review';
export type AutomationType = 'smart-action' | 'prompt-hook';

export interface Automation {
  id: string;
  name: string;
  emoji?: string;
  icon?: string;
  iconType?: 'svg' | 'png';
  description?: string;
  feedback: string;
  type: AutomationType;
  source: 'custom' | 'library';
  author?: string;
  repo?: string;
  inspiredBy?: { name: string; url: string }[];
  enabled: boolean;
}

export interface AutomationsResponse {
  automations: Automation[];
  library: Automation[];
}

/* ─── API Functions ─── */

export async function fetchAutomations(context: AutomationContext): Promise<AutomationsResponse> {
  try {
    const res = await fetch(`/api/automations?context=${context}`);
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch {
    // Fallback: return empty if server unavailable (demo mode)
    return { automations: [], library: [] };
  }
}

export async function saveAutomation(context: AutomationContext, automation: Automation): Promise<void> {
  await fetch('/api/automations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(automation),
  });
}

export async function deleteAutomation(context: AutomationContext, name: string): Promise<void> {
  await fetch(`/api/automations?name=${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function resetAutomations(context: AutomationContext): Promise<void> {
  await fetch('/api/automations/reset', { method: 'POST' });
}

export async function updateAutomationState(
  context: AutomationContext,
  state: { enabled?: string[]; disabled?: string[]; order?: string[] },
): Promise<void> {
  await fetch('/api/automations/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
}

/* ─── Prompt Hook Formatting (operates on in-memory data) ─── */

export function formatPromptHooks(hookIds: string[], automations: Automation[]): string {
  const active = automations.filter(a => a.type === 'prompt-hook' && hookIds.includes(a.id));
  if (active.length === 0) return '';
  const items = active.map(h => `- ${h.feedback}`).join('\n');
  return `\n\n---\n\n# Additional Tasks\n\nAfter addressing the above, also do the following:\n${items}`;
}
