import { mkdirSync } from "fs";
import { homedir } from "os";
import path from "path";

const SESSION_PLAN_FILE = "plan.md";
const SESSION_PLAN_ROOT = [".plannotator", "session-plans", "opencode"];

function shouldStripPlanModeLine(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return normalized.includes("strictly forbidden: any file edits")
    || normalized.includes("your plan at ")
    || normalized.includes("plan file already exists at ")
    || normalized.includes(".opencode/plans/")
    || normalized.includes("plan_exit")
    || (normalized.includes("agent's conversation") && normalized.includes("not on disk"));
}

function cleanupSystemEntry(entry: string): string {
  return entry
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeSessionID(sessionID: string): string {
  const sanitized = sessionID
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "session";
}

export function getSessionPlanPath(
  sessionID: string,
  homeDirectory: string = homedir(),
): string {
  return path.join(
    homeDirectory,
    ...SESSION_PLAN_ROOT,
    sanitizeSessionID(sessionID),
    SESSION_PLAN_FILE,
  );
}

export function ensureSessionPlanPath(
  sessionID: string,
  homeDirectory: string = homedir(),
): string {
  const planPath = getSessionPlanPath(sessionID, homeDirectory);
  mkdirSync(path.dirname(planPath), { recursive: true });
  return planPath;
}

export function stripConflictingPlanModeRules(systemEntries: string[]): string[] {
  return systemEntries
    .map((entry) =>
      cleanupSystemEntry(
        entry
          .split("\n")
          .filter((line) => !shouldStripPlanModeLine(line))
          .join("\n"),
      ),
    )
    .filter(Boolean);
}
