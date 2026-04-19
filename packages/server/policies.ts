/**
 * Approval policies — global + per-project rules that decide whether a plan
 * should auto-approve after the multi-LLM council finishes, or whether a
 * human must click Approve.
 *
 * Storage: `~/.plannotator/policies.yaml` (or `.json`). Hand-edited.
 *
 * Schema (everything optional; defaults to "auto-approve everything"):
 *   global:
 *     block_on_patterns:
 *       - "DROP TABLE"
 *       - "rm -rf /"
 *   projects:
 *     plannotator:
 *       block_on_patterns:
 *         - "schema migration"
 *
 * Project blocks merge into global blocks (union, not override) so a project
 * policy can ADD blocks on top of the global set — never silently weaken.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

export interface Policy {
  /** Regex patterns (RegExp source strings) — if any matches the plan, hold. */
  block_on_patterns?: string[];
}

export interface PolicyFile {
  global?: Policy;
  projects?: Record<string, Policy>;
}

export interface PolicyDecision {
  auto_approve: boolean;
  /** Reasons the plan was held; empty when auto_approve=true. */
  blocked_by: { pattern: string; evidence: string }[];
}

function home(): string {
  return process.env.HOME || homedir();
}

function policiesPath(): string {
  return resolve(home(), ".plannotator", "policies.yaml");
}

function policiesPathJson(): string {
  return resolve(home(), ".plannotator", "policies.json");
}

/**
 * Minimal YAML reader for the very narrow shape this file accepts.
 * Avoids pulling a YAML dependency. Supports: top-level keys, nested
 * keys one level deep, and string-list values via "- item".
 *
 * Anything more complex falls back to JSON.
 */
function parseTinyYaml(src: string): PolicyFile {
  const out: PolicyFile = {};
  const lines = src.split(/\r?\n/);
  type Frame = { obj: Record<string, unknown>; indent: number; pendingKey?: string };
  const root: Record<string, unknown> = out as unknown as Record<string, unknown>;
  const stack: Frame[] = [{ obj: root, indent: -1 }];

  // Pre-process into a list of {indent, trimmed} so we can look ahead.
  const tokens: { indent: number; trimmed: string }[] = [];
  for (const raw of lines) {
    const stripped = raw.replace(/#.*$/, "").trimEnd();
    if (!stripped.trim()) continue;
    const indent = stripped.match(/^\s*/)?.[0].length ?? 0;
    tokens.push({ indent, trimmed: stripped.trim() });
  }

  for (let i = 0; i < tokens.length; i++) {
    const { indent, trimmed } = tokens[i];

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const top = stack[stack.length - 1];

    // List item — populates an array under the current frame's pendingKey.
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
      const key = top.pendingKey;
      if (!key) continue;
      const existing = top.obj[key];
      const arr = Array.isArray(existing) ? (existing as string[]) : [];
      arr.push(value);
      top.obj[key] = arr;
      continue;
    }

    // key: value  OR  key:
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];

    if (!value) {
      // Look ahead: if the next deeper non-empty line is a list item, this
      // key is an ARRAY (not a parent of nested keys). Skip the frame push.
      const next = tokens[i + 1];
      const isArrayKey =
        next && next.indent > indent && next.trimmed.startsWith("- ");
      if (isArrayKey) {
        top.obj[key] = [];
        top.pendingKey = key;
        // Don't push a frame — list items handler reads from current top.
      } else {
        const child: Record<string, unknown> = {};
        top.obj[key] = child;
        top.pendingKey = key;
        stack.push({ obj: child, indent });
      }
    } else {
      const stripped = value.replace(/^["']|["']$/g, "");
      top.obj[key] = stripped;
      top.pendingKey = key;
    }
  }

  return out;
}

export function loadPolicies(): PolicyFile {
  // Prefer .json if it exists (easier for tools to write); fall back to .yaml
  if (existsSync(policiesPathJson())) {
    try {
      return JSON.parse(readFileSync(policiesPathJson(), "utf8")) as PolicyFile;
    } catch {
      return {};
    }
  }
  if (existsSync(policiesPath())) {
    try {
      return parseTinyYaml(readFileSync(policiesPath(), "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Decide whether `plan` is allowed to auto-approve under the active policies
 * for `project`. Project blocks union with global blocks.
 */
export function evaluatePolicy(
  plan: string,
  project: string,
  file?: PolicyFile,
): PolicyDecision {
  const policies = file ?? loadPolicies();
  const patterns = new Set<string>();
  for (const p of policies.global?.block_on_patterns ?? []) patterns.add(p);
  for (const p of policies.projects?.[project]?.block_on_patterns ?? []) patterns.add(p);

  if (patterns.size === 0) {
    return { auto_approve: true, blocked_by: [] };
  }

  const blockedBy: { pattern: string; evidence: string }[] = [];
  for (const patternSrc of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(patternSrc, "i");
    } catch {
      continue;
    }
    const m = plan.match(re);
    if (m) {
      blockedBy.push({
        pattern: patternSrc,
        evidence: m[0].length > 80 ? m[0].slice(0, 77) + "…" : m[0],
      });
    }
  }

  return { auto_approve: blockedBy.length === 0, blocked_by: blockedBy };
}
