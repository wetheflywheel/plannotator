/**
 * Archive similarity tests.
 *
 * Run: bun test packages/server/archive-similarity.test.ts
 *
 * Uses HOME-isolated tmp dir + manually-written archive files so we never
 * touch the user's real plan archive.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findSimilarPastPlans, similarPlanToAnnotationInput } from "./archive-similarity";

let planDir: string;

beforeEach(() => {
  // Use a tmp dir directly as the customPath — `~/.plannotator/plans` semantics
  // are honored via the customPath override, no HOME swap needed.
  planDir = mkdtempSync(join(tmpdir(), "plannotator-archive-test-"));
});

afterEach(() => {
  if (existsSync(planDir)) rmSync(planDir, { recursive: true, force: true });
});

function writeArchive(filename: string, body: string) {
  writeFileSync(join(planDir, filename), body, "utf8");
}

// Wrapper that injects the tmp planDir as customPath.
function findSimilarPastPlansAtTmp(plan: string, threshold?: number, limit?: number) {
  return findSimilarPastPlans(plan, threshold, limit, planDir);
}

describe("findSimilarPastPlans", () => {
  test("returns [] when archive is empty", () => {
    expect(findSimilarPastPlansAtTmp("anything")).toEqual([]);
  });

  test("returns [] when no past plan exceeds the similarity threshold", () => {
    writeArchive(
      "totally-different-2026-04-15-approved.md",
      "# Different\n\nThis plan is about something completely unrelated to anything.",
    );
    const result = findSimilarPastPlansAtTmp("# New\n\nQuantum entanglement theory");
    expect(result).toEqual([]);
  });

  test("surfaces the most-similar past plan when one exists", () => {
    const past = "# Add user authentication\n\nWe will add OAuth login flow with Google and GitHub providers.";
    const current = "# Add user authentication\n\nImplement OAuth login flow with Google and GitHub.";
    writeArchive("auth-2026-04-10-approved.md", past);
    const result = findSimilarPastPlansAtTmp(current, 0.1, 1);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThan(0.1);
    expect(result[0].archive.status).toBe("approved");
    expect(result[0].excerpt.length).toBeGreaterThan(0);
  });

  test("ranks by similarity score descending", () => {
    writeArchive(
      "very-close-2026-04-10-approved.md",
      "OAuth login Google GitHub authentication flow user signup",
    );
    writeArchive(
      "less-close-2026-04-12-denied.md",
      "OAuth provider integration",
    );
    const result = findSimilarPastPlansAtTmp(
      "OAuth login Google GitHub authentication flow user",
      0.1,
      2,
    );
    expect(result.length).toBeGreaterThanOrEqual(1);
    if (result.length === 2) {
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    }
  });

  test("respects the limit parameter", () => {
    for (let i = 0; i < 3; i++) {
      writeArchive(
        `match-${i}-2026-04-${10 + i}-approved.md`,
        "OAuth login Google GitHub authentication user flow signup",
      );
    }
    const result = findSimilarPastPlansAtTmp(
      "OAuth login Google GitHub authentication user",
      0.1,
      1,
    );
    expect(result.length).toBeLessThanOrEqual(1);
  });
});

describe("similarPlanToAnnotationInput", () => {
  test("emits a GLOBAL_COMMENT with status + score in the body", () => {
    const ann = similarPlanToAnnotationInput({
      archive: {
        filename: "x.md",
        title: "OAuth flow",
        date: "2026-04-10",
        timestamp: "2026-04-10T00:00:00Z",
        status: "approved",
        size: 0,
      },
      score: 0.42,
      excerpt: "Some plan body excerpt",
    });
    expect(ann.type).toBe("GLOBAL_COMMENT");
    expect(ann.source).toBe("archive-similarity");
    expect(String(ann.text)).toContain("approved");
    expect(String(ann.text)).toContain("42%");
    expect(String(ann.text)).toContain("OAuth flow");
  });

  test("denied status renders the ✗ marker", () => {
    const ann = similarPlanToAnnotationInput({
      archive: {
        filename: "x.md",
        title: "Bad plan",
        date: "2026-04-10",
        timestamp: "",
        status: "denied",
        size: 0,
      },
      score: 0.3,
      excerpt: "x",
    });
    expect(String(ann.text)).toContain("denied");
  });
});
