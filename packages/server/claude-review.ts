/**
 * Claude Code Review Agent — prompt, command builder, and JSONL output parser.
 *
 * Complements codex-review.ts. Both produce the same schema (ReviewOutputEvent).
 * Claude uses --json-schema (inline JSON + Ajv validation with retries) instead
 * of Codex's --output-schema (file path + API-level strict mode).
 *
 * Claude uses --output-format stream-json for live JSONL streaming. The final
 * event is type:"result" with structured_output containing validated findings.
 */

import type { CodexReviewOutput } from "./codex-review";

// ---------------------------------------------------------------------------
// Schema — same as Codex, serialized as inline JSON for --json-schema flag
// ---------------------------------------------------------------------------

export const CLAUDE_REVIEW_SCHEMA_JSON = JSON.stringify({
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          confidence_score: { type: "number" },
          priority: { type: ["integer", "null"] },
          code_location: {
            type: "object",
            properties: {
              absolute_file_path: { type: "string" },
              line_range: {
                type: "object",
                properties: {
                  start: { type: "integer" },
                  end: { type: "integer" },
                },
                required: ["start", "end"],
                additionalProperties: false,
              },
            },
            required: ["absolute_file_path", "line_range"],
            additionalProperties: false,
          },
        },
        required: ["title", "body", "confidence_score", "priority", "code_location"],
        additionalProperties: false,
      },
    },
    overall_correctness: { type: "string" },
    overall_explanation: { type: "string" },
    overall_confidence_score: { type: "number" },
  },
  required: ["findings", "overall_correctness", "overall_explanation", "overall_confidence_score"],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// Review prompt — adapted from anthropics/claude-code code-review plugin
// ---------------------------------------------------------------------------

export const CLAUDE_REVIEW_PROMPT = `You are a code reviewer. Provide a thorough code review of the changes.

**Agent assumptions (applies to all agents and subagents):**
- All tools are functional and will work without error. Do not test tools or make exploratory calls.
- Only call a tool if it is required to complete the task. Every tool call should have a clear purpose.

Follow these steps:

1. Examine the diff to understand what changed. Use git diff, git log, git show, or gh pr diff as appropriate for the context.

2. Launch parallel agents to independently review the changes. Each agent should return the list of issues, where each issue includes a description and the reason it was flagged. The agents should:

   Agent 1: Bug agent
   Scan for obvious bugs. Focus only on the diff itself without reading extra context. Flag only significant bugs; ignore nitpicks and likely false positives. Do not flag issues that you cannot validate without looking at context outside of the git diff.

   Agent 2: Deep analysis agent
   Look for problems that exist in the introduced code. This could be security issues, incorrect logic, etc. Only look for issues that fall within the changed code. Read surrounding code for context.

   **CRITICAL: We only want HIGH SIGNAL issues.** Flag issues where:
   - The code will fail to compile or parse (syntax errors, type errors, missing imports, unresolved references)
   - The code will definitely produce wrong results regardless of inputs (clear logic errors)
   - Security vulnerabilities with concrete exploit paths

   Do NOT flag:
   - Code style or quality concerns
   - Potential issues that depend on specific inputs or state
   - Subjective suggestions or improvements
   - Missing tests or documentation

   If you are not certain an issue is real, do not flag it. False positives erode trust and waste reviewer time.

3. For each issue found, launch parallel agents to validate. Each validator should confirm the issue is real with high confidence by examining the actual code. If validation fails, drop the issue.

4. Return all validated findings as structured output matching the JSON schema. Include an overall correctness verdict.

At the beginning of each finding title, tag with priority level:
- [P0] – Drop everything to fix. Blocking.
- [P1] – Urgent. Should be addressed in the next cycle.
- [P2] – Normal. To be fixed eventually.
- [P3] – Low. Nice to have.

Set the numeric priority field accordingly (0-3). If priority cannot be determined, use null.

Do NOT post any comments to GitHub or GitLab. Do NOT use gh pr comment or any commenting tool. Your only output is the structured JSON findings.`;

// ---------------------------------------------------------------------------
// Command builder
// ---------------------------------------------------------------------------

export interface ClaudeCommandResult {
  command: string[];
  /** Prompt text to write to stdin (Claude reads prompt from stdin, not argv). */
  stdinPrompt: string;
}

/**
 * Build the `claude -p` command. Prompt is passed via stdin, not as a
 * positional arg — avoids quoting issues, argv limits, and variadic flag conflicts.
 */
export function buildClaudeCommand(prompt: string): ClaudeCommandResult {
  const allowedTools = [
    "Agent", "Read", "Glob", "Grep",
    "Bash(gh pr view:*)", "Bash(gh pr diff:*)", "Bash(gh pr list:*)",
    "Bash(gh issue view:*)", "Bash(gh issue list:*)",
    "Bash(gh api repos/*/*/pulls/*)", "Bash(gh api repos/*/*/pulls/*/files*)",
    "Bash(gh api repos/*/*/pulls/*/comments*)", "Bash(gh api repos/*/*/issues/*/comments*)",
    "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
    "Bash(git show:*)", "Bash(git blame:*)", "Bash(git branch:*)",
    "Bash(git grep:*)", "Bash(git ls-remote:*)", "Bash(git ls-tree:*)",
    "Bash(git merge-base:*)", "Bash(git remote:*)", "Bash(git rev-parse:*)",
    "Bash(git show-ref:*)",
    "Bash(find:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(wc:*)",
  ].join(",");

  const disallowedTools = [
    "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch",
    "Bash(python:*)", "Bash(python3:*)", "Bash(node:*)", "Bash(npx:*)",
    "Bash(bun:*)", "Bash(bunx:*)", "Bash(sh:*)", "Bash(bash:*)", "Bash(zsh:*)",
    "Bash(curl:*)", "Bash(wget:*)",
  ].join(",");

  return {
    command: [
      "claude", "-p",
      "--permission-mode", "dontAsk",
      "--output-format", "stream-json",
      "--verbose",
      "--json-schema", CLAUDE_REVIEW_SCHEMA_JSON,
      "--no-session-persistence",
      "--model", "sonnet",
      "--tools", "Agent,Bash,Read,Glob,Grep",
      "--allowedTools", allowedTools,
      "--disallowedTools", disallowedTools,
    ],
    stdinPrompt: prompt,
  };
}

// ---------------------------------------------------------------------------
// JSONL stream output parser
// ---------------------------------------------------------------------------

/**
 * Parse Claude Code's stream-json output (JSONL).
 * Extracts structured_output from the final type:"result" event.
 * Returns the same CodexReviewOutput shape for provider-agnostic transform.
 */
export function parseClaudeStreamOutput(stdout: string): CodexReviewOutput | null {
  if (!stdout.trim()) return null;

  // Find the last result event in the JSONL stream
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const event = JSON.parse(line);

      if (event.type === 'result') {
        if (event.is_error) return null;

        const output = event.structured_output;
        if (!output || !Array.isArray(output.findings)) return null;

        return output as CodexReviewOutput;
      }
    } catch {
      // Not valid JSON — skip (could be a partial line or log noise)
    }
  }

  return null;
}

/**
 * Extract log-worthy content from a JSONL line for the LiveLogViewer.
 * Returns a human-readable string, or null if the line should be skipped.
 */
export function formatClaudeLogEvent(line: string): string | null {
  try {
    const event = JSON.parse(line);

    // Skip the final result event — handled separately
    if (event.type === 'result') return null;

    // Assistant messages (the agent's thinking/responses)
    if (event.type === 'assistant' && event.message?.content) {
      const parts = Array.isArray(event.message.content) ? event.message.content : [event.message.content];
      const texts = parts
        .filter((p: any) => p.type === 'text' && p.text)
        .map((p: any) => p.text);
      if (texts.length > 0) return texts.join('\n');
    }

    // Tool use events
    if (event.type === 'assistant' && event.message?.content) {
      const tools = (Array.isArray(event.message.content) ? event.message.content : [])
        .filter((p: any) => p.type === 'tool_use');
      if (tools.length > 0) {
        return tools.map((t: any) => `[${t.name}] ${typeof t.input === 'string' ? t.input.slice(0, 100) : JSON.stringify(t.input).slice(0, 100)}`).join('\n');
      }
    }

    return null;
  } catch {
    return null;
  }
}
