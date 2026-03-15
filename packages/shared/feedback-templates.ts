/**
 * Shared feedback templates for all agent integrations.
 *
 * These are the messages sent back to LLM agents when users deny plans,
 * submit code review feedback, or provide annotation feedback.
 *
 * The plan deny template was tuned in #224 / commit 3dca977 to use strong
 * directive framing — Claude was ignoring softer phrasing.
 */

// ── Plan deny ────────────────────────────────────────────────────────

export const planDenyFeedback = (
  feedback: string,
  toolName: string = "ExitPlanMode",
): string =>
  `YOUR PLAN WAS NOT APPROVED. You MUST revise the plan to address ALL of the feedback below before calling ${toolName} again. Do not resubmit the same plan — use the Edit tool to make targeted changes to the plan file first. Do NOT change the plan title (first # heading) unless the user explicitly asks you to.\n\n${feedback || "Plan changes requested"}`;

// ── Code review ──────────────────────────────────────────────────────

export const codeReviewFeedback = (feedback: string): string =>
  `# Code Review Feedback\n\n${feedback}\n\nThe reviewer has identified issues above. You MUST address all of them.`;

export const codeReviewApproved = (): string =>
  `Code review completed — no changes requested.`;

// ── Annotate ─────────────────────────────────────────────────────────

export const annotateFeedback = (
  feedback: string,
  filePath?: string,
): string => {
  const fileRef = filePath ? `File: ${filePath}\n\n` : "";
  return `# Markdown Annotations\n\n${fileRef}${feedback}\n\nYou MUST address the annotation feedback above.`;
};
