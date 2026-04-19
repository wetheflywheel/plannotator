/**
 * Per-project waivers for CLAUDE.md rule violations.
 *
 * When a user dismisses a `claude-md-rules` annotation in the UI, the
 * rule id is appended to a JSON file at `~/.plannotator/waivers/<project>.json`.
 * On subsequent plan reviews, the rules engine filters out any violation
 * whose id is in the waiver list — silencing chronic noise per project
 * without modifying the global rule set.
 *
 * Storage shape: a flat JSON array of rule id strings.
 *   ["no-enums", "create-readme"]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

function waiversDir(): string {
  // Prefer the live env var over `homedir()` so tests that swap HOME for an
  // isolated tmp dir see the change immediately. `homedir()` is cached by
  // Node on first call.
  const home = process.env.HOME || homedir();
  return resolve(home, ".plannotator", "waivers");
}

function fileFor(project: string): string {
  // sanitize project to a safe filename — strip everything that isn't alphanumeric, dash, underscore, dot
  const safe = (project || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(waiversDir(), `${safe}.json`);
}

export function loadWaivers(project: string): string[] {
  const path = fileFor(project);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

/**
 * Append a rule id to the project's waiver list. Idempotent.
 * Returns the updated list.
 */
export function addWaiver(project: string, ruleId: string): string[] {
  if (!ruleId || typeof ruleId !== "string") return loadWaivers(project);
  const current = loadWaivers(project);
  if (current.includes(ruleId)) return current;
  const next = [...current, ruleId];
  try {
    mkdirSync(waiversDir(), { recursive: true });
    writeFileSync(fileFor(project), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("[waivers] write failed:", err);
  }
  return next;
}

/**
 * Remove a rule id from the project's waiver list. No-op if not present.
 */
export function removeWaiver(project: string, ruleId: string): string[] {
  const current = loadWaivers(project);
  const next = current.filter((id) => id !== ruleId);
  if (next.length === current.length) return current;
  try {
    mkdirSync(waiversDir(), { recursive: true });
    writeFileSync(fileFor(project), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("[waivers] write failed:", err);
  }
  return next;
}
