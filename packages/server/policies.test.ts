/**
 * Approval policies tests.
 *
 * Run: bun test packages/server/policies.test.ts
 */

import { describe, expect, test } from "bun:test";
import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluatePolicy, loadPolicies, type PolicyFile } from "./policies";

describe("evaluatePolicy — defaults", () => {
  test("auto-approves when no policies are defined", () => {
    const decision = evaluatePolicy("any plan content", "myproj", {});
    expect(decision.auto_approve).toBe(true);
    expect(decision.blocked_by).toHaveLength(0);
  });
});

describe("evaluatePolicy — global blocks", () => {
  const file: PolicyFile = {
    global: { block_on_patterns: ["DROP TABLE", "rm -rf"] },
  };

  test("holds when plan matches a global block pattern", () => {
    const decision = evaluatePolicy("Step 1: DROP TABLE users", "myproj", file);
    expect(decision.auto_approve).toBe(false);
    expect(decision.blocked_by).toHaveLength(1);
    expect(decision.blocked_by[0].pattern).toBe("DROP TABLE");
  });

  test("auto-approves when plan does not match any global block", () => {
    const decision = evaluatePolicy("safe refactoring plan", "myproj", file);
    expect(decision.auto_approve).toBe(true);
  });

  test("matches case-insensitively", () => {
    const decision = evaluatePolicy("we will rm -rf the dist dir", "myproj", file);
    expect(decision.auto_approve).toBe(false);
    expect(decision.blocked_by[0].pattern).toBe("rm -rf");
  });
});

describe("evaluatePolicy — project blocks union with global", () => {
  const file: PolicyFile = {
    global: { block_on_patterns: ["DROP TABLE"] },
    projects: {
      sensitive: { block_on_patterns: ["secret", "api_key"] },
    },
  };

  test("project block fires for that project", () => {
    const decision = evaluatePolicy("rotate the api_key", "sensitive", file);
    expect(decision.auto_approve).toBe(false);
  });

  test("project block does not affect other projects", () => {
    const decision = evaluatePolicy("rotate the api_key", "other", file);
    expect(decision.auto_approve).toBe(true);
  });

  test("global block still fires for project-specific plans", () => {
    const decision = evaluatePolicy("DROP TABLE foo", "sensitive", file);
    expect(decision.auto_approve).toBe(false);
  });
});

describe("loadPolicies — YAML parser", () => {
  let originalHome: string | undefined;
  let tmp: string;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tmp = mkdtempSync(join(tmpdir(), "plannotator-policies-test-"));
    process.env.HOME = tmp;
    mkdirSync(join(tmp, ".plannotator"), { recursive: true });
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  });

  test("parses nested global → block_on_patterns array", () => {
    writeFileSync(
      join(tmp, ".plannotator", "policies.yaml"),
      "global:\n  block_on_patterns:\n    - \"DROP TABLE\"\n    - rm -rf\n",
    );
    const policies = loadPolicies();
    expect(policies.global?.block_on_patterns).toEqual(["DROP TABLE", "rm -rf"]);
  });

  test("parses per-project blocks", () => {
    writeFileSync(
      join(tmp, ".plannotator", "policies.yaml"),
      "projects:\n  myproj:\n    block_on_patterns:\n      - api_key\n",
    );
    const policies = loadPolicies();
    expect(policies.projects?.myproj?.block_on_patterns).toEqual(["api_key"]);
  });

  test("policies.json takes precedence over policies.yaml", () => {
    writeFileSync(
      join(tmp, ".plannotator", "policies.yaml"),
      "global:\n  block_on_patterns:\n    - yaml-pattern\n",
    );
    writeFileSync(
      join(tmp, ".plannotator", "policies.json"),
      JSON.stringify({ global: { block_on_patterns: ["json-pattern"] } }),
    );
    const policies = loadPolicies();
    expect(policies.global?.block_on_patterns).toEqual(["json-pattern"]);
  });

  test("returns {} when no file exists", () => {
    expect(loadPolicies()).toEqual({});
  });
});

describe("evaluatePolicy — output shape", () => {
  test("blocked_by includes evidence substring, truncated when long", () => {
    const longText = "x".repeat(200);
    const file: PolicyFile = { global: { block_on_patterns: [`x{50,}`] } };
    const decision = evaluatePolicy(longText, "p", file);
    expect(decision.auto_approve).toBe(false);
    expect(decision.blocked_by[0].evidence.length).toBeLessThanOrEqual(80);
    expect(decision.blocked_by[0].evidence).toContain("…");
  });

  test("invalid regex patterns are skipped silently", () => {
    const file: PolicyFile = { global: { block_on_patterns: ["[unclosed", "DROP TABLE"] } };
    const decision = evaluatePolicy("DROP TABLE foo", "p", file);
    // Invalid pattern skipped; valid one still fires.
    expect(decision.auto_approve).toBe(false);
    expect(decision.blocked_by).toHaveLength(1);
  });
});
