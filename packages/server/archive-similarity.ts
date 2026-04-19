/**
 * Archive-aware plan similarity.
 *
 * On every new plan, scan `~/.plannotator/plans/` for past plans (approved
 * + denied decision snapshots) that are textually similar. Surface the
 * most-similar match as a single annotation so the user sees prior outcomes
 * before approving the new plan.
 *
 * Cheap: Jaccard similarity over lowercased word bigrams. No embeddings,
 * no external calls, no dependencies.
 */

import { listArchivedPlans, readArchivedPlan, type ArchivedPlan } from "@plannotator/shared/storage";

export interface SimilarPlan {
  /** Past archived plan metadata. */
  archive: ArchivedPlan;
  /** Jaccard score on bigrams, 0..1. */
  score: number;
  /** First ~200 chars of the past plan body, for inline preview. */
  excerpt: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "to", "of", "in", "on",
  "for", "with", "is", "are", "be", "as", "at", "by", "this", "that", "it",
  "we", "will", "from", "have", "has", "not", "no", "do", "does", "can",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function bigrams(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the top N past plans most textually similar to `plan`.
 *
 * @param plan - the current plan markdown
 * @param threshold - minimum Jaccard score to include (default 0.15)
 * @param limit - max results (default 1 — surface only the closest)
 */
export function findSimilarPastPlans(
  plan: string,
  threshold = 0.15,
  limit = 1,
  customPath?: string | null,
): SimilarPlan[] {
  const archives = listArchivedPlans(customPath ?? undefined);
  if (archives.length === 0) return [];

  const planTokens = tokenize(plan);
  const planBigrams = bigrams(planTokens);
  if (planBigrams.size === 0) return [];

  const scored: SimilarPlan[] = [];
  for (const arc of archives) {
    const body = readArchivedPlan(arc.filename, customPath ?? undefined);
    if (!body) continue;
    const bg = bigrams(tokenize(body));
    const score = jaccard(planBigrams, bg);
    if (score < threshold) continue;
    const excerpt = body.replace(/^#+\s*/g, "").slice(0, 240).trim();
    scored.push({ archive: arc, score, excerpt });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Convert a similar-plan match into an external-annotation input shape.
 * Surfaces as a GLOBAL_COMMENT so it lives in the sidebar alongside the
 * CLAUDE.md rule annotations.
 */
export function similarPlanToAnnotationInput(s: SimilarPlan): Record<string, unknown> {
  const status = s.archive.status === "approved" ? "✓ approved" :
                 s.archive.status === "denied" ? "✗ denied" : "(unknown)";
  const pct = Math.round(s.score * 100);
  const text = [
    `**You may have tried this before** (${pct}% similar)`,
    "",
    `**${s.archive.title}** · ${s.archive.date} · ${status}`,
    "",
    `> ${s.excerpt.replace(/\n+/g, " ").slice(0, 200)}…`,
  ].join("\n");

  return {
    source: "archive-similarity",
    type: "GLOBAL_COMMENT",
    text,
    author: `Archive · ${s.archive.status}`,
  };
}
