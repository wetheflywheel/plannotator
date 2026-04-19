/**
 * CLAUDE.md rules engine tests.
 *
 * Run: bun test packages/server/claude-md-rules.test.ts
 */

import { describe, expect, test } from "bun:test";
import { findViolations, type ClaudeMdSource } from "./claude-md-rules";

const ENUM_RULE: ClaudeMdSource = {
  path: "/fake/CLAUDE.md",
  content: "## Anti-Patterns\n- Use enums - prefer string literals",
};

const NO_DOCS_RULE: ClaudeMdSource = {
  path: "/fake/CLAUDE.md",
  content: "Add README/docs unless explicitly requested",
};

const NO_VERIFY_RULE: ClaudeMdSource = {
  path: "/fake/CLAUDE.md",
  content: "Never skip hooks (--no-verify)",
};

const FORCE_PUSH_RULE: ClaudeMdSource = {
  path: "/fake/CLAUDE.md",
  content: "Never run destructive git commands like force-push",
};

const DEEPL_RULE: ClaudeMdSource = {
  path: "/fake/CLAUDE.md",
  content: "Translations: always use DeepL — never use Google Translate.",
};

const SERVER_CONFIG_RULE: ClaudeMdSource = {
  path: "/fake/CLAUDE.md",
  content: "Never modify server configs directly (nginx.conf, redis.conf)",
};

describe("findViolations — gating", () => {
  test("returns empty when no CLAUDE.md sources are provided", () => {
    const plan = "```ts\nenum Color { Red }\n```";
    expect(findViolations(plan, [])).toHaveLength(0);
  });

  test("does not flag a pattern unless a matching rule exists", () => {
    const plan = "```ts\nenum Color { Red }\n```";
    const irrelevantRule: ClaudeMdSource = {
      path: "/fake/CLAUDE.md",
      content: "Always run tests before committing.",
    };
    expect(findViolations(plan, [irrelevantRule])).toHaveLength(0);
  });
});

describe("findViolations — enum detector", () => {
  test("flags an enum declaration in a code block", () => {
    const plan = "Plan:\n```ts\nenum Color { Red, Blue }\n```";
    const violations = findViolations(plan, [ENUM_RULE]);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toMatch(/^no-enums:/);
    expect(violations[0].rulePath).toBe("/fake/CLAUDE.md");
  });

  test("ignores the word 'enum' in prose outside code blocks", () => {
    const plan = "We considered using an enum here, but decided against it.";
    expect(findViolations(plan, [ENUM_RULE])).toHaveLength(0);
  });
});

describe("findViolations — README/docs detector", () => {
  test("flags 'create README' in plan prose", () => {
    const plan = "Step 3: create README.md describing the API.";
    const violations = findViolations(plan, [NO_DOCS_RULE]);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toMatch(/^create-readme:/);
  });

  test("flags 'add documentation' phrasing", () => {
    const plan = "We will add documentation for the new module.";
    expect(findViolations(plan, [NO_DOCS_RULE])).toHaveLength(1);
  });

  test("does not flag merely mentioning README without a verb", () => {
    const plan = "The README explains the layout.";
    expect(findViolations(plan, [NO_DOCS_RULE])).toHaveLength(0);
  });
});

describe("findViolations — git safety detectors", () => {
  test("flags --no-verify usage", () => {
    const plan = "Run `git commit --no-verify -m 'fix'`";
    const violations = findViolations(plan, [NO_VERIFY_RULE]);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toMatch(/^no-verify:/);
  });

  test("flags force-push", () => {
    const plan = "Then `git push --force` to update main.";
    const violations = findViolations(plan, [FORCE_PUSH_RULE]);
    expect(violations).toHaveLength(1);
    expect(violations[0].id).toMatch(/^force-push:/);
  });
});

describe("findViolations — translation provider detector", () => {
  test("flags Google Translate references", () => {
    const plan = "Use Google Translate for the Spanish copy.";
    expect(findViolations(plan, [DEEPL_RULE])).toHaveLength(1);
  });

  test("flags Azure Translate references", () => {
    const plan = "Wire up Azure-Translate for the new locales.";
    expect(findViolations(plan, [DEEPL_RULE])).toHaveLength(1);
  });
});

describe("findViolations — server config detector", () => {
  test("flags nginx.conf modifications", () => {
    const plan = "Edit /etc/nginx/nginx.conf to add the new vhost.";
    expect(findViolations(plan, [SERVER_CONFIG_RULE])).toHaveLength(1);
  });
});

describe("findViolations — output shape", () => {
  test("annotations include evidence and rule path", () => {
    const plan = "Run `git commit --no-verify`.";
    const v = findViolations(plan, [NO_VERIFY_RULE])[0];
    expect(v.evidence).toBe("--no-verify");
    expect(v.source).toBe("claude-md-rules");
    expect(v.text).toContain("CLAUDE.md");
  });

  test("dedupes identical evidence within one plan", () => {
    const plan = "First `--no-verify`, then later `--no-verify` again.";
    const violations = findViolations(plan, [NO_VERIFY_RULE]);
    expect(violations).toHaveLength(1);
  });

  test("emits multiple violations across detectors", () => {
    const plan = [
      "Use `git push --force`",
      "and add documentation in README.md.",
      "```ts",
      "enum Color { Red }",
      "```",
    ].join("\n");
    const sources = [ENUM_RULE, NO_DOCS_RULE, FORCE_PUSH_RULE];
    const violations = findViolations(plan, sources);
    const ids = violations.map((v) => v.id.split(":")[0]).sort();
    expect(ids).toEqual(["create-readme", "force-push", "no-enums"]);
  });
});
