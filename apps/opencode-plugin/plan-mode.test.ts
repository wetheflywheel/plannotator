import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import {
  ensureSessionPlanPath,
  getSessionPlanPath,
  sanitizeSessionID,
  stripConflictingPlanModeRules,
} from "./plan-mode";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("sanitizeSessionID", () => {
  test("preserves slug-like session IDs", () => {
    expect(sanitizeSessionID("curried-coalescing-cascade")).toBe("curried-coalescing-cascade");
  });

  test("replaces unsafe path characters", () => {
    expect(sanitizeSessionID("plan/session:42?draft")).toBe("plan-session-42-draft");
  });
});

describe("getSessionPlanPath", () => {
  test("stores session plans outside the repo under plannotator", () => {
    const planPath = getSessionPlanPath("curried-coalescing-cascade", "/tmp/home");
    expect(planPath).toBe(
      path.join(
        "/tmp/home",
        ".plannotator",
        "session-plans",
        "opencode",
        "curried-coalescing-cascade",
        "plan.md",
      ),
    );
  });

  test("creates the parent directory on demand", () => {
    const homeDir = mkdtempSync(path.join(tmpdir(), "plannotator-opencode-"));
    tempDirs.push(homeDir);

    const planPath = ensureSessionPlanPath("curried-coalescing-cascade", homeDir);

    expect(existsSync(path.dirname(planPath))).toBe(true);
  });
});

describe("stripConflictingPlanModeRules", () => {
  test("removes OpenCode's blanket file-edit prohibition", () => {
    expect(
      stripConflictingPlanModeRules([
        "Read-only mode\nSTRICTLY FORBIDDEN: ANY file edits.\nUse the tools carefully.",
      ]),
    ).toEqual(["Read-only mode\nUse the tools carefully."]);
  });

  test("drops conversation-only plan storage lines and keeps unrelated instructions", () => {
    expect(
      stripConflictingPlanModeRules([
        "The plan lives only in the agent's conversation, not on disk.\nKeep the plan concise.",
      ]),
    ).toEqual(["Keep the plan concise."]);
  });

  test("drops experimental plan path lines", () => {
    expect(
      stripConflictingPlanModeRules([
        "Create your plan at /tmp/.opencode/plans/1234-test.md\nKeep the plan concise.",
      ]),
    ).toEqual(["Keep the plan concise."]);
  });

  test("drops experimental plan_exit instructions", () => {
    expect(
      stripConflictingPlanModeRules([
        "Call plan_exit when the plan is ready.\nKeep the plan concise.",
      ]),
    ).toEqual(["Keep the plan concise."]);
  });
});
