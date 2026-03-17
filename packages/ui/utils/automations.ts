/**
 * Automations — preset feedback messages for one-click agent interaction
 *
 * Plan and review automations are stored separately — different cookie keys,
 * different defaults, different library catalogs. The UI component is shared
 * but each context manages its own data.
 *
 * Two automation types:
 * - smart-action: fires immediately, sends feedback to agent
 * - prompt-hook: toggleable, appends to next approve/deny
 */

import { storage } from './storage';

export type AutomationContext = 'plan' | 'review';
export type AutomationType = 'smart-action' | 'prompt-hook';

const STORAGE_KEYS: Record<AutomationContext, string> = {
  plan: 'plannotator-automations-plan-v2',
  review: 'plannotator-automations-review-v2',
};

export interface Automation {
  id: string;
  name: string;
  emoji?: string;
  icon?: string;
  description?: string;
  feedback: string;
  type: AutomationType;
  source: 'custom' | 'library';
  author?: string;
  repoUrl?: string;
  inspiredBy?: { name: string; url: string }[];
  enabled: boolean;
}

/* ─── Defaults (what new users start with) ─── */

export const DEFAULT_PLAN_AUTOMATIONS: Automation[] = [
  {
    id: 'simplify-approach',
    name: 'Simplify the approach',
    emoji: '✂️',
    description: 'Reduce complexity, remove over-engineering',
    feedback: 'This plan is over-engineered. Simplify it:\n- Remove abstractions that only have one consumer\n- Prefer inline code over utility functions for one-off operations\n- Cut any features not explicitly requested\n- Identify the minimal set of changes needed to achieve the goal\n\nResubmit with the simplest approach that works.',
    type: 'smart-action',
    source: 'library',
    author: 'plannotator',
    enabled: true,
  },
];

export const DEFAULT_REVIEW_AUTOMATIONS: Automation[] = [
  {
    id: 'security-review',
    name: 'Security review',
    emoji: '🔒',
    description: 'Check for security vulnerabilities',
    feedback: 'Review this code for security issues:\n- Input validation and sanitization\n- Authentication and authorization gaps\n- Data exposure or leakage risks\n- Injection vulnerabilities (SQL, XSS, command injection)\n- Secrets or credentials handling\n\nFlag any issues found and propose fixes.',
    type: 'smart-action',
    source: 'library',
    author: 'plannotator',
    enabled: true,
  },
];

export const DEFAULT_PLAN_HOOKS: Automation[] = [
  {
    id: 'create-github-issue',
    name: 'Create GitHub issue',
    emoji: '📎',
    description: 'Summarize plan as a GitHub issue',
    feedback: 'Create a GitHub issue summarizing this plan, the key decisions, and next steps.',
    type: 'prompt-hook',
    source: 'library',
    author: 'plannotator',
    enabled: true,
  },
  {
    id: 'update-project-tracker',
    name: 'Update project tracker',
    emoji: '📋',
    description: 'Update Linear, Jira, etc.',
    feedback: 'Update the relevant project tracker (Linear, Jira, etc.) with the current status and decisions made.',
    type: 'prompt-hook',
    source: 'library',
    author: 'plannotator',
    enabled: true,
  },
];

export const DEFAULT_REVIEW_HOOKS: Automation[] = [
  {
    id: 'run-tests',
    name: 'Run tests',
    emoji: '🧪',
    description: 'Run full test suite before committing',
    feedback: 'Run the full test suite and fix any failures before committing these changes.',
    type: 'prompt-hook',
    source: 'library',
    author: 'plannotator',
    enabled: true,
  },
  {
    id: 'update-changelog',
    name: 'Update changelog',
    emoji: '📝',
    description: 'Add changelog entry for these changes',
    feedback: 'Add an entry to the changelog describing these changes.',
    type: 'prompt-hook',
    source: 'library',
    author: 'plannotator',
    enabled: true,
  },
];

const DEFAULTS: Record<AutomationContext, Automation[]> = {
  plan: [...DEFAULT_PLAN_AUTOMATIONS, ...DEFAULT_PLAN_HOOKS],
  review: [...DEFAULT_REVIEW_AUTOMATIONS, ...DEFAULT_REVIEW_HOOKS],
};

/* ─── Library (browsable catalog, superset of defaults) ─── */

export const LIBRARY_AUTOMATIONS: Record<AutomationContext, Automation[]> = {
  plan: [
    // Smart Actions
    ...DEFAULT_PLAN_AUTOMATIONS,
    {
      id: 'expand-plan',
      name: 'Expand on this',
      emoji: '🔭',
      description: 'Ask for more detail and depth',
      feedback: 'This plan needs more detail. For each major step:\n- Break it into concrete sub-steps\n- Specify which files will be modified\n- Describe the expected behavior after changes\n- Call out any assumptions that need verification',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'security-review',
      name: 'Security review',
      emoji: '🔒',
      description: 'Check for security vulnerabilities',
      feedback: 'Review this for security issues:\n- Input validation and sanitization\n- Authentication and authorization gaps\n- Data exposure or leakage risks\n- Injection vulnerabilities (SQL, XSS, command injection)\n- Secrets or credentials handling\n\nFlag any issues found and propose fixes.',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'add-test-strategy',
      name: 'Add test strategy',
      emoji: '🧪',
      description: 'Include testing approach in the plan',
      feedback: 'This plan is missing a testing strategy. Add:\n- Which functions/components need unit tests?\n- Are there integration tests needed?\n- What are the key test cases (happy path, edge cases, error cases)?\n- How will you verify the changes work end-to-end?',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'break-into-phases',
      name: 'Break into phases',
      emoji: '🪜',
      description: 'Split into incremental milestones',
      feedback: 'This plan tries to do too much at once. Break it into phases:\n- Phase 1: minimal viable change that works end-to-end\n- Phase 2+: incremental additions building on Phase 1\n\nEach phase should be independently shippable and testable.',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    // Prompt Hooks
    {
      id: 'create-github-issue',
      name: 'Create GitHub issue',
      emoji: '📎',
      description: 'Summarize plan as a GitHub issue',
      feedback: 'Create a GitHub issue summarizing this plan, the key decisions, and next steps.',
      type: 'prompt-hook',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'update-project-tracker',
      name: 'Update project tracker',
      emoji: '📋',
      description: 'Update Linear, Jira, etc.',
      feedback: 'Update the relevant project tracker (Linear, Jira, etc.) with the current status and decisions made.',
      type: 'prompt-hook',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
  ],
  review: [
    // Smart Actions
    ...DEFAULT_REVIEW_AUTOMATIONS,
    {
      id: 'add-error-handling',
      name: 'Add error handling',
      emoji: '🛡️',
      description: 'Consider edge cases and failure modes',
      feedback: 'Review this code for missing error handling and edge cases:\n- What happens when inputs are invalid or missing?\n- What are the failure modes for external calls (network, disk, APIs)?\n- Are there race conditions or concurrency issues?\n- What should the user see when something goes wrong?\n\nAdd concrete error handling to address these.',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'performance-check',
      name: 'Performance check',
      emoji: '⚡',
      description: 'Identify performance bottlenecks',
      feedback: 'Analyze this code for performance issues:\n- Are there unnecessary re-renders or recomputations?\n- Any N+1 queries or redundant API calls?\n- Large data structures being copied when they could be mutated?\n- Missing memoization or caching opportunities?\n\nPropose specific optimizations.',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'check-consistency',
      name: 'Check consistency',
      emoji: '🧬',
      description: 'Ensure patterns match existing codebase',
      feedback: 'Before proceeding, verify that this code is consistent with the existing codebase:\n- Search for similar patterns already in use\n- Match naming conventions, file organization, and code style\n- Reuse existing utilities, helpers, and components where possible\n- Do not introduce new patterns when existing ones work fine',
      type: 'smart-action',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    // Prompt Hooks
    {
      id: 'run-tests',
      name: 'Run tests',
      emoji: '🧪',
      description: 'Run full test suite before committing',
      feedback: 'Run the full test suite and fix any failures before committing these changes.',
      type: 'prompt-hook',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
    {
      id: 'update-changelog',
      name: 'Update changelog',
      emoji: '📝',
      description: 'Add changelog entry for these changes',
      feedback: 'Add an entry to the changelog describing these changes.',
      type: 'prompt-hook',
      source: 'library',
      author: 'plannotator',
      enabled: true,
    },
  ],
};

/* ─── Storage ─── */

export function getAutomations(context: AutomationContext): Automation[] {
  const raw = storage.getItem(STORAGE_KEYS[context]);
  if (!raw) return DEFAULTS[context];
  try {
    const parsed = JSON.parse(raw) as Automation[];
    return parsed.length > 0 ? parsed : DEFAULTS[context];
  } catch {
    return DEFAULTS[context];
  }
}

export function saveAutomations(context: AutomationContext, automations: Automation[]): void {
  storage.setItem(STORAGE_KEYS[context], JSON.stringify(automations));
}

export function resetAutomations(context: AutomationContext): void {
  storage.removeItem(STORAGE_KEYS[context]);
}

export function getEnabledAutomations(context: AutomationContext): Automation[] {
  return getAutomations(context).filter(a => a.enabled);
}

/** Format active prompt hooks into a feedback appendix */
export function formatPromptHooks(hookIds: string[], context: AutomationContext): string {
  const all = getAutomations(context);
  const active = all.filter(a => a.type === 'prompt-hook' && hookIds.includes(a.id));
  if (active.length === 0) return '';
  const items = active.map(h => `- ${h.feedback}`).join('\n');
  return `\n\n---\n\n# Additional Tasks\n\nAfter addressing the above, also do the following:\n${items}`;
}
