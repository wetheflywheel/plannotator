import { describe, test, expect } from "bun:test";
import {
  planDenyFeedback,
  codeReviewFeedback,
  codeReviewApproved,
  annotateFeedback,
} from "./feedback-templates";

describe("feedback-templates", () => {
  /**
   * The whole point of this module: all three integrations (hook, opencode, pi)
   * produce identical output except for the tool name. If this test fails,
   * the templates have diverged — which is what we're trying to prevent.
   */
  test("plan deny is identical across integrations (modulo tool name)", () => {
    const normalize = (s: string) =>
      s.replace(/ExitPlanMode|submit_plan|exit_plan_mode/g, "TOOL");

    const feedback = "## 1. Remove auth section\n> Not needed anymore.";
    const hook = normalize(planDenyFeedback(feedback, "ExitPlanMode"));
    const opencode = normalize(planDenyFeedback(feedback, "submit_plan"));
    const pi = normalize(planDenyFeedback(feedback, "exit_plan_mode"));

    expect(hook).toBe(opencode);
    expect(opencode).toBe(pi);
  });

  /**
   * The deny template must embed the user's feedback verbatim — no truncation,
   * no escaping, no wrapping. The agent needs the raw annotation output.
   */
  test("plan deny preserves feedback content verbatim", () => {
    const feedback = "## 1. Change auth\n**From:**\n```\nold code\n```\n**To:**\n```\nnew code\n```";
    const result = planDenyFeedback(feedback);
    expect(result).toContain(feedback);
  });

  test("code review feedback preserves content verbatim", () => {
    const feedback = "### Line 42 (new)\n```suggestion\nconst x = 1;\n```";
    const result = codeReviewFeedback(feedback);
    expect(result).toContain(feedback);
  });

  test("annotate feedback preserves content verbatim", () => {
    const feedback = "## 1. Comment on: \"setup()\"\n> This needs error handling";
    const result = annotateFeedback(feedback, "/src/main.ts");
    expect(result).toContain(feedback);
  });

  /**
   * Empty feedback should not produce a broken message — the agent needs
   * something actionable even if the user didn't write annotations.
   */
  test("plan deny handles empty feedback gracefully", () => {
    const result = planDenyFeedback("");
    expect(result.length).toBeGreaterThan(50);
    // Should not end with just whitespace or have a dangling separator
    expect(result.trimEnd()).toBe(result.trimEnd());
  });

  /**
   * The annotate template optionally includes a file path so the agent knows
   * which file the annotations refer to.
   */
  test("annotate feedback includes file path when given, omits when not", () => {
    const withPath = annotateFeedback("fix typo", "/src/readme.md");
    const withoutPath = annotateFeedback("fix typo");

    expect(withPath).toContain("/src/readme.md");
    expect(withoutPath).not.toContain("File:");
  });

  /**
   * Version history is keyed by the plan's first # heading + date.
   * If the agent renames the heading on resubmission, the version chain breaks
   * and the user loses diffs (#296). The deny template must instruct the agent
   * to preserve the title.
   */
  test("plan deny instructs agent to preserve plan title", () => {
    const result = planDenyFeedback("feedback");
    // Must mention the heading / title and tell the agent not to change it
    expect(result.toLowerCase()).toContain("title");
    expect(result.toLowerCase()).toContain("heading");
  });

  /**
   * Approved code review is a distinct message — it should NOT contain
   * directive language that would confuse the agent into thinking there's work to do.
   */
  test("code review approved does not contain directive language", () => {
    const result = codeReviewApproved();
    expect(result).not.toContain("MUST");
    expect(result).not.toContain("address");
    expect(result).not.toContain("fix");
  });
});
