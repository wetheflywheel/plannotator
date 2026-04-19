/**
 * Waiver storage tests.
 *
 * Run: bun test packages/server/claude-md-waivers.test.ts
 *
 * Uses HOME-isolated tmp dir so we never touch the user's real waivers.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addWaiver, loadWaivers, removeWaiver } from "./claude-md-waivers";

let originalHome: string | undefined;
let tmp: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  tmp = mkdtempSync(join(tmpdir(), "plannotator-waivers-test-"));
  process.env.HOME = tmp;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe("loadWaivers", () => {
  test("returns empty list for unknown project", () => {
    expect(loadWaivers("nope")).toEqual([]);
  });
});

describe("addWaiver", () => {
  test("creates the file and stores the rule id", () => {
    const list = addWaiver("myproj", "no-enums");
    expect(list).toEqual(["no-enums"]);
    expect(loadWaivers("myproj")).toEqual(["no-enums"]);
  });

  test("is idempotent for the same rule id", () => {
    addWaiver("myproj", "no-enums");
    const list = addWaiver("myproj", "no-enums");
    expect(list).toEqual(["no-enums"]);
  });

  test("appends new rule ids to the existing list", () => {
    addWaiver("myproj", "no-enums");
    const list = addWaiver("myproj", "create-readme");
    expect(list).toContain("no-enums");
    expect(list).toContain("create-readme");
  });

  test("scopes per project", () => {
    addWaiver("a", "no-enums");
    addWaiver("b", "create-readme");
    expect(loadWaivers("a")).toEqual(["no-enums"]);
    expect(loadWaivers("b")).toEqual(["create-readme"]);
  });

  test("ignores empty rule ids", () => {
    expect(addWaiver("myproj", "")).toEqual([]);
  });

  test("sanitizes project names with unsafe characters", () => {
    // Should not throw and should round-trip
    const list = addWaiver("../bad/name", "x");
    expect(list).toEqual(["x"]);
    expect(loadWaivers("../bad/name")).toEqual(["x"]);
  });
});

describe("removeWaiver", () => {
  test("removes a previously-waived rule id", () => {
    addWaiver("myproj", "no-enums");
    addWaiver("myproj", "create-readme");
    const list = removeWaiver("myproj", "no-enums");
    expect(list).toEqual(["create-readme"]);
  });

  test("is a no-op for unknown rule ids", () => {
    addWaiver("myproj", "no-enums");
    const list = removeWaiver("myproj", "force-push");
    expect(list).toEqual(["no-enums"]);
  });
});
