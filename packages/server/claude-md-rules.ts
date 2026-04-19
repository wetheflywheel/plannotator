/**
 * CLAUDE.md-aware plan review.
 *
 * Walks up from the plan's working directory collecting CLAUDE.md files
 * (project, ancestor dirs, and ~/.claude/CLAUDE.md), then runs the plan
 * through a small set of high-confidence anti-pattern detectors. Each match
 * becomes an external annotation with `source: "claude-md-rules"`, surfaced
 * inline as a GLOBAL_COMMENT so the user sees rule violations alongside the
 * council's review.
 *
 * Designed to be cheap (pure regex, runs in <50ms) and conservative (only
 * fires when a rule is actually documented in a CLAUDE.md within scope, so
 * we don't lecture users about preferences they don't hold).
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { loadWaivers } from "./claude-md-waivers";

export interface ClaudeMdSource {
  path: string;
  content: string;
}

export interface RuleViolation {
  id: string;
  text: string;        // human-readable annotation body
  source: string;      // always "claude-md-rules"
  evidence?: string;   // matched substring from the plan
  rulePath?: string;   // CLAUDE.md path that documents the rule
}

interface DetectorRule {
  id: string;
  /**
   * Multiple keyword regexes that must ALL match somewhere in a single
   * CLAUDE.md source for the rule to be considered in force. Order-agnostic.
   */
  ruleKeywords: RegExp[];
  /** Pattern to look for in the plan. */
  planPattern: RegExp;
  /** If true, only match inside fenced code blocks. */
  inCodeBlocksOnly?: boolean;
  /** Message rendered as the annotation body. */
  message: string;
}

// Curated, high-confidence detectors. Each one only fires when the
// corresponding rule keyword is present in some CLAUDE.md in scope.
const DETECTORS: DetectorRule[] = [
  {
    id: "no-enums",
    ruleKeywords: [/\benums?\b/i, /\b(string literals|prefer|don'?t|avoid|never)\b/i],
    planPattern: /\benum\s+\w+/g,
    inCodeBlocksOnly: true,
    message:
      "Plan introduces an `enum` declaration. CLAUDE.md prefers string literals over enums.",
  },
  {
    id: "create-readme",
    ruleKeywords: [/\b(README|docs?)\b/i, /\b(unless|explicit|don'?t|never|requested)\b/i],
    planPattern: /(?:create|add|generate|write|new)[^\n.]{0,40}\b(README(?:\.md)?|documentation)\b/gi,
    message:
      "Plan creates a README or new documentation. CLAUDE.md says don't create docs unless explicitly requested.",
  },
  {
    id: "no-verify",
    ruleKeywords: [/\b(--no-verify|skip.{0,15}hooks?|never.{0,15}skip.{0,15}hook)\b/i],
    planPattern: /--no-verify\b/g,
    message:
      "Plan uses `--no-verify` to bypass git hooks. CLAUDE.md forbids skipping hooks; investigate the failure instead.",
  },
  {
    id: "force-push",
    ruleKeywords: [/\b(force[-\s]?push|--force|destructive)\b/i],
    planPattern: /git\s+push\s+(?:--force\b|-f\b|--force-with-lease\b)/g,
    message:
      "Plan force-pushes. CLAUDE.md flags this as destructive; confirm before the action runs.",
  },
  {
    id: "amend-commit",
    ruleKeywords: [/\b(amend|--amend)\b/i, /\b(don'?t|never|prefer)\b/i],
    planPattern: /git\s+commit\s+--amend\b/g,
    message:
      "Plan amends an existing commit. CLAUDE.md prefers creating a new commit over amending.",
  },
  {
    id: "modify-server-config",
    ruleKeywords: [/\b(nginx|redis|postfix|server config)\b/i, /\b(never|don'?t|directly)\b/i],
    planPattern: /\b(nginx\.conf|redis\.conf|php\.ini|postfix.*\.cf)\b/g,
    message:
      "Plan modifies a server config file directly. CLAUDE.md forbids editing server configs.",
  },
  {
    id: "google-translate",
    ruleKeywords: [/\b(deepl)\b/i, /\b(always|never|use)\b/i],
    planPattern: /\b(google\s*translate|googletrans|@google-cloud\/translate|azure[\s-]translate)\b/gi,
    message:
      "Plan uses Google/Azure Translate. CLAUDE.md mandates DeepL for all translations.",
  },
  {
    id: "delete-existing-code",
    ruleKeywords: [/\b(never delete|don'?t delete)\b/i, /\b(code|unused|dead code)\b/i],
    planPattern: /(?:delete|remove)[^\n.]{0,40}\b(unused|dead|legacy|old)\b[^\n.]{0,40}\bcode\b/gi,
    message:
      "Plan removes pre-existing code. CLAUDE.md says don't delete code unless explicitly instructed.",
  },
];

// ---------------------------------------------------------------------------
// CLAUDE.md discovery
// ---------------------------------------------------------------------------

/**
 * Walk from `cwd` up to filesystem root collecting CLAUDE.md candidates.
 * Also includes `~/.claude/CLAUDE.md`. Returns deduped, ordered nearest-first.
 */
export function findClaudeMdFiles(cwd: string): ClaudeMdSource[] {
  const seen = new Set<string>();
  const sources: ClaudeMdSource[] = [];

  const tryAdd = (path: string) => {
    const real = resolve(path);
    if (seen.has(real)) return;
    seen.add(real);
    if (!existsSync(real)) return;
    try {
      if (!statSync(real).isFile()) return;
      const content = readFileSync(real, "utf8");
      sources.push({ path: real, content });
    } catch {
      // ignore unreadable files
    }
  };

  let dir = resolve(cwd);
  // Bound walk to 20 levels to avoid pathological loops.
  for (let i = 0; i < 20; i++) {
    tryAdd(join(dir, "CLAUDE.md"));
    tryAdd(join(dir, ".claude", "CLAUDE.md"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Global user-scope CLAUDE.md
  tryAdd(join(homedir(), ".claude", "CLAUDE.md"));

  return sources;
}

// ---------------------------------------------------------------------------
// Plan scanning
// ---------------------------------------------------------------------------

/**
 * Strip everything outside fenced code blocks; useful for code-only patterns.
 */
function codeBlocksOnly(plan: string): string {
  const blocks: string[] = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plan)) !== null) blocks.push(m[1]);
  return blocks.join("\n");
}

/**
 * Run all detectors against the plan, gated by which rules appear in any
 * CLAUDE.md in scope.
 */
export function findViolations(
  plan: string,
  sources: ClaudeMdSource[],
): RuleViolation[] {
  if (!plan || sources.length === 0) return [];

  const violations: RuleViolation[] = [];
  const codeOnly = codeBlocksOnly(plan);

  for (const det of DETECTORS) {
    // Find first CLAUDE.md where ALL ruleKeywords match somewhere in the file.
    const ruleSource = sources.find((s) =>
      det.ruleKeywords.every((re) => re.test(s.content)),
    );
    if (!ruleSource) continue;

    const haystack = det.inCodeBlocksOnly ? codeOnly : plan;
    if (!haystack) continue;

    // Reset regex lastIndex (g-flag patterns are stateful).
    det.planPattern.lastIndex = 0;
    const matches = haystack.match(det.planPattern);
    if (!matches || matches.length === 0) continue;

    // Dedupe identical evidence so we don't spam the sidebar.
    const seenEvidence = new Set<string>();
    for (const evidence of matches) {
      const key = evidence.toLowerCase().trim();
      if (seenEvidence.has(key)) continue;
      seenEvidence.add(key);

      violations.push({
        id: `${det.id}:${seenEvidence.size}`,
        text: det.message,
        source: "claude-md-rules",
        evidence: evidence.length > 80 ? evidence.slice(0, 77) + "…" : evidence,
        rulePath: ruleSource.path,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Public orchestrator
// ---------------------------------------------------------------------------

/**
 * Discover CLAUDE.md files near `cwd` and return any rule violations
 * detected in `plan`, minus any rules waived for this project.
 *
 * @param project - optional project slug used to look up per-project
 *   waivers. When omitted, no waivers are applied.
 */
export function scanPlanAgainstClaudeMd(
  plan: string,
  cwd: string,
  project?: string,
): RuleViolation[] {
  const sources = findClaudeMdFiles(cwd);
  const violations = findViolations(plan, sources);
  if (!project) return violations;
  const waived = new Set(loadWaivers(project));
  if (waived.size === 0) return violations;
  return violations.filter((v) => !waived.has(v.id.split(":")[0]));
}

/**
 * Convert a violation into the shape the external-annotations store expects.
 */
export function violationToAnnotationInput(v: RuleViolation): Record<string, unknown> {
  const evidence = v.evidence ? `\n\n**Evidence:** \`${v.evidence}\`` : "";
  const ruleRef = v.rulePath ? `\n\n_Source: ${v.rulePath}_` : "";
  // ruleId is the prefix before the first ":" — encoded into author so the
  // UI's dismiss handler can extract it and POST a waiver.
  const ruleId = v.id.split(":")[0];
  return {
    source: v.source,
    type: "GLOBAL_COMMENT",
    text: `**CLAUDE.md rule:** ${v.text}${evidence}${ruleRef}`,
    author: `CLAUDE.md rules:${ruleId}`,
  };
}
