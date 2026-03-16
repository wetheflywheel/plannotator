/**
 * Plannotator Plugin for OpenCode
 *
 * Provides Pi-style iterative planning with interactive browser-based plan review.
 * Works with both OpenCode's native plan mode (experimental flag) and without it.
 *
 * When the agent is in plan mode:
 * - Injects Pi-style iterative planning prompt
 * - Agent writes plan to file on disk (PLAN.md or .opencode/plans/*.md)
 * - submit_plan reads plan from disk and opens browser UI
 * - plan_exit suppressed in favor of submit_plan
 *
 * Environment variables:
 *   PLANNOTATOR_REMOTE - Set to "1" or "true" for remote mode (devcontainer, SSH)
 *   PLANNOTATOR_PORT   - Fixed port to use (default: random locally, 19432 for remote)
 *   PLANNOTATOR_PLAN_TIMEOUT_SECONDS - Max wait for submit_plan approval (default: 345600, set 0 to disable)
 *   PLANNOTATOR_ALLOW_SUBAGENTS - Set to "1" to allow subagents to see submit_plan tool
 *
 * @packageDocumentation
 */

import { type Plugin, tool } from "@opencode-ai/plugin";
import {
  startPlannotatorServer,
  handleServerReady,
} from "@plannotator/server";
import {
  startReviewServer,
  handleReviewServerReady,
} from "@plannotator/server/review";
import {
  startAnnotateServer,
  handleAnnotateServerReady,
} from "@plannotator/server/annotate";
import { getGitContext, runGitDiff } from "@plannotator/server/git";
import { writeRemoteShareLink } from "@plannotator/server/share-url";
import { resolveMarkdownFile } from "@plannotator/server/resolve-file";
import { planDenyFeedback } from "@plannotator/shared/feedback-templates";

// @ts-ignore - Bun import attribute for text
import indexHtml from "./plannotator.html" with { type: "text" };
const htmlContent = indexHtml as unknown as string;

// @ts-ignore - Bun import attribute for text
import reviewHtml from "./review-editor.html" with { type: "text" };
const reviewHtmlContent = reviewHtml as unknown as string;

const DEFAULT_PLAN_TIMEOUT_SECONDS = 345_600; // 96 hours
const DEFAULT_PLAN_FILE = "PLAN.md";

// ── Plan file resolution ──────────────────────────────────────────────────

/**
 * Parse the plan file path from OpenCode's injected system prompt.
 * OpenCode injects text like "your plan at /path/to/plan.md" when experimental plan mode is on.
 * Falls back to PLAN.md in the project directory.
 */
function resolvePlanFilePath(system: string[], projectDir: string): string {
  const joined = system.join("\n");

  // Match OpenCode's experimental plan mode path injection
  // e.g. "your plan at .opencode/plans/1234-slug.md" or "plan at /absolute/path.md"
  const match = joined.match(/your plan at ([^\s.][^\s]*\.md)/i)
    || joined.match(/plan file (?:already )?exists at ([^\s.][^\s]*\.md)/i);

  if (match?.[1]) {
    const parsed = match[1];
    // If it's already absolute, return as-is
    if (parsed.startsWith("/")) return parsed;
    // Resolve relative to project directory
    return `${projectDir}/${parsed}`;
  }

  return `${projectDir}/${DEFAULT_PLAN_FILE}`;
}

// ── Planning prompt (adapted from Pi) ─────────────────────────────────────

function getPlanningPrompt(planFilePath: string): string {
  return `## Plannotator — Iterative Planning

You are pair-planning with the user. Your plan file is at ${planFilePath}.

Available tools: read, bash, grep, glob, write (${planFilePath} only), edit (${planFilePath} only), submit_plan, question

Do not run destructive bash commands (rm, git push, npm install, etc.) — focus on reading and exploring the codebase.

### The Loop

Repeat until the plan is complete:

1. **Explore** — Use read, grep, glob, bash, and subagents to understand the codebase. Actively search for existing functions, utilities, and patterns that can be reused.
2. **Update the plan file** — After each discovery, immediately capture what you learned in ${planFilePath}. Don't wait until the end. Use write for the initial draft, then edit for all subsequent updates.
3. **Ask the user** — When you hit an ambiguity or decision you can't resolve from code alone, use the question tool to ask. Then go back to step 1.

### First Turn

Start by quickly scanning key files to form an initial understanding of the task scope. Then create the plan file using the write tool with a skeleton (headers and rough notes), and ask the user your first round of questions via the question tool. Don't explore exhaustively before engaging the user. After the initial write, use the edit tool for all subsequent updates.

### Asking Good Questions

- Never ask what you could find out by reading the code.
- Batch related questions together.
- Focus on things only the user can answer: requirements, preferences, tradeoffs, edge-case priorities.
- Scale depth to the task — a vague feature request needs many rounds; a focused bug fix may need one or none.

### Plan File Structure

Your plan file should use markdown with clear sections:
- **Context** — Why this change is being made: the problem, what prompted it, the intended outcome.
- **Approach** — Your recommended approach only, not all alternatives considered.
- **Files to modify** — List the critical file paths that will be changed.
- **Reuse** — Reference existing functions and utilities you found, with their file paths.
- **Steps** — Implementation checklist:
  - [ ] Step 1 description
  - [ ] Step 2 description
- **Verification** — How to test the changes end-to-end.

Keep the plan concise enough to scan quickly, but detailed enough to execute effectively.

### When to Submit

Your plan is ready when you've addressed all ambiguities and it covers: what to change, which files to modify, what existing code to reuse, and how to verify. Call submit_plan to submit for visual review.

Do NOT call plan_exit — use submit_plan for plan review.

### Revising After Feedback

When the user denies a plan with feedback:
1. Read ${planFilePath} to see the current plan.
2. Use the edit tool to make targeted changes addressing the feedback — do NOT rewrite the entire file.
3. Call submit_plan again to resubmit.

### Ending Your Turn

Your turn should only end by either:
- Using the question tool to ask the user for information.
- Calling submit_plan when the plan is ready for review.

Do not end your turn without doing one of these two things.`;
}

// ── Plugin ────────────────────────────────────────────────────────────────

export const PlannotatorPlugin: Plugin = async (ctx) => {
  // Resolved plan file path (set during system.transform, read by submit_plan)
  let resolvedPlanFilePath: string | null = null;

  // Helper to determine if sharing is enabled (lazy evaluation)
  // Priority: OpenCode config > env var > default (enabled)
  async function getSharingEnabled(): Promise<boolean> {
    try {
      const response = await ctx.client.config.get({ query: { directory: ctx.directory } });
      // @ts-ignore - share config may exist
      const share = response?.data?.share;
      if (share !== undefined) {
        return share !== "disabled";
      }
    } catch {
      // Config read failed, fall through to env var
    }
    return process.env.PLANNOTATOR_SHARE !== "disabled";
  }

  function getShareBaseUrl(): string | undefined {
    return process.env.PLANNOTATOR_SHARE_URL || undefined;
  }

  function getPlanTimeoutSeconds(): number | null {
    const raw = process.env.PLANNOTATOR_PLAN_TIMEOUT_SECONDS?.trim();
    if (!raw) return DEFAULT_PLAN_TIMEOUT_SECONDS;

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      console.error(
        `[Plannotator] Invalid PLANNOTATOR_PLAN_TIMEOUT_SECONDS="${raw}". Using default ${DEFAULT_PLAN_TIMEOUT_SECONDS}s.`
      );
      return DEFAULT_PLAN_TIMEOUT_SECONDS;
    }

    if (parsed === 0) return null;
    return parsed;
  }

  function allowSubagents(): boolean {
    const val = process.env.PLANNOTATOR_ALLOW_SUBAGENTS?.trim();
    return val === "1" || val === "true";
  }

  return {
    // Register submit_plan as primary-only tool (hidden from sub-agents by default)
    config: async (opencodeConfig) => {
      if (allowSubagents()) return;

      const existingPrimaryTools = opencodeConfig.experimental?.primary_tools ?? [];
      if (!existingPrimaryTools.includes("submit_plan")) {
        opencodeConfig.experimental = {
          ...opencodeConfig.experimental,
          primary_tools: [...existingPrimaryTools, "submit_plan"],
        };
      }
    },

    // Suppress plan_exit in favor of submit_plan
    "tool.definition": async (input, output) => {
      if (input.toolID === "plan_exit") {
        output.description =
          "Do not call this tool. Use submit_plan instead — it opens a visual review UI for plan approval.";
      }
    },

    // Inject planning instructions into system prompt
    "experimental.chat.system.transform": async (input, output) => {
      // Skip for title generation requests
      const existingSystem = output.system.join("\n").toLowerCase();
      if (existingSystem.includes("title generator") || existingSystem.includes("generate a title")) {
        return;
      }

      let lastUserAgent: string | undefined;
      try {
        // Fetch session messages to determine current agent
        const messagesResponse = await ctx.client.session.messages({
          // @ts-ignore - sessionID exists on input
          path: { id: input.sessionID }
        });
        const messages = messagesResponse.data;

        // Find last user message (reverse iteration)
        if (messages) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.info.role === "user") {
              // @ts-ignore - UserMessage has agent field
              lastUserAgent = msg.info.agent;
              break;
            }
          }
        }

        // Skip if agent detection fails (safer)
        if (!lastUserAgent) return;

        // Hardcoded exclusion: build agent
        if (lastUserAgent === "build") return;

        // Dynamic exclusion: check agent mode via API
        const agentsResponse = await ctx.client.app.agents({
          query: { directory: ctx.directory }
        });
        const agents = agentsResponse.data;
        const agent = agents?.find((a: { name: string }) => a.name === lastUserAgent);

        // Skip if agent is a sub-agent
        // @ts-ignore - Agent has mode field
        if (agent?.mode === "subagent") return;

      } catch {
        // Skip injection on any error (safer)
        return;
      }

      // Resolve plan file path from OpenCode's system prompt
      const planFilePath = resolvePlanFilePath(output.system, ctx.directory);
      resolvedPlanFilePath = planFilePath;

      // Plan agent: inject full iterative planning prompt
      if (lastUserAgent === "plan") {
        output.system.push(getPlanningPrompt(planFilePath));
        return;
      }

      // Other primary agents: inject minimal submission reminder
      output.system.push(`
## Plan Submission

When you have completed your plan, you MUST call the \`submit_plan\` tool to submit it for user review.
The user will be able to:
- Review your plan visually in a dedicated UI
- Annotate specific sections with feedback
- Approve the plan to proceed with implementation
- Request changes with detailed feedback

If your plan is rejected, you will receive the user's annotated feedback. Revise your plan
based on their feedback and call submit_plan again.

Do NOT proceed with implementation until your plan is approved.
`);
    },

    // Listen for slash commands
    event: async ({ event }) => {
      const isCommandEvent =
        event.type === "command.executed" ||
        event.type === "tui.command.execute";

      // @ts-ignore - Event structure varies
      const commandName = event.properties?.name || event.command || event.payload?.name;
      const isReviewCommand = commandName === "plannotator-review";

      if (isCommandEvent && isReviewCommand) {
        ctx.client.app.log({
          level: "info",
          message: "Opening code review UI...",
        });

        const gitContext = await getGitContext();
        const { patch: rawPatch, label: gitRef, error: diffError } = await runGitDiff(
          "uncommitted",
          gitContext.defaultBranch
        );

        const server = await startReviewServer({
          rawPatch,
          gitRef,
          error: diffError,
          origin: "opencode",
          diffType: "uncommitted",
          gitContext,
          sharingEnabled: await getSharingEnabled(),
          shareBaseUrl: getShareBaseUrl(),
          htmlContent: reviewHtmlContent,
          opencodeClient: ctx.client,
          onReady: handleReviewServerReady,
        });

        const result = await server.waitForDecision();
        await Bun.sleep(1500);
        server.stop();

        if (result.feedback) {
          // @ts-ignore - Event properties contain sessionID
          const sessionId = event.properties?.sessionID;

          if (sessionId) {
            const shouldSwitchAgent = result.agentSwitch && result.agentSwitch !== 'disabled';
            const targetAgent = result.agentSwitch || 'build';

            const message = result.approved
              ? `# Code Review\n\nCode review completed — no changes requested.`
              : `# Code Review Feedback\n\n${result.feedback}\n\nPlease address this feedback.`;

            try {
              await ctx.client.session.prompt({
                path: { id: sessionId },
                body: {
                  ...(shouldSwitchAgent && { agent: targetAgent }),
                  parts: [{ type: "text", text: message }],
                },
              });
            } catch {
              // Session may not be available
            }
          }
        }
      }

      // Handle /plannotator-annotate command
      const isAnnotateCommand = commandName === "plannotator-annotate";

      if (isCommandEvent && isAnnotateCommand) {
        // @ts-ignore - Event properties contain arguments
        const filePath = event.properties?.arguments || event.arguments || "";

        if (!filePath) {
          ctx.client.app.log({
            level: "error",
            message: "Usage: /plannotator-annotate <file.md>",
          });
          return;
        }

        ctx.client.app.log({
          level: "info",
          message: `Opening annotation UI for ${filePath}...`,
        });

        const projectRoot = process.cwd();
        const resolved = await resolveMarkdownFile(filePath, projectRoot);

        if (resolved.kind === "ambiguous") {
          ctx.client.app.log({
            level: "error",
            message: `Ambiguous filename "${resolved.input}" — found ${resolved.matches.length} matches:\n${resolved.matches.map((m) => `  ${m}`).join("\n")}`,
          });
          return;
        }
        if (resolved.kind === "not_found") {
          ctx.client.app.log({
            level: "error",
            message: `File not found: ${resolved.input}`,
          });
          return;
        }

        const absolutePath = resolved.path;
        ctx.client.app.log({
          level: "info",
          message: `Resolved: ${absolutePath}`,
        });
        const markdown = await Bun.file(absolutePath).text();

        const server = await startAnnotateServer({
          markdown,
          filePath: absolutePath,
          origin: "opencode",
          sharingEnabled: await getSharingEnabled(),
          shareBaseUrl: getShareBaseUrl(),
          htmlContent: htmlContent,
          onReady: handleAnnotateServerReady,
        });

        const result = await server.waitForDecision();
        await Bun.sleep(1500);
        server.stop();

        if (result.feedback) {
          // @ts-ignore - Event properties contain sessionID
          const sessionId = event.properties?.sessionID;

          if (sessionId) {
            try {
              await ctx.client.session.prompt({
                path: { id: sessionId },
                body: {
                  parts: [
                    {
                      type: "text",
                      text: `# Markdown Annotations\n\nFile: ${absolutePath}\n\n${result.feedback}\n\nPlease address the annotation feedback above.`,
                    },
                  ],
                },
              });
            } catch {
              // Session may not be available
            }
          }
        }
      }
    },

    tool: {
      submit_plan: tool({
        description:
          "Submit your plan for interactive user review. The user can annotate, approve, or request changes in a visual browser UI. Call this when your plan file is ready for review.",
        args: {
          plan: tool.schema
            .string()
            .optional()
            .describe("The plan in markdown format. If omitted, reads from the plan file on disk."),
          summary: tool.schema
            .string()
            .describe("A brief 1-2 sentence summary of what the plan accomplishes"),
        },

        async execute(args, context) {
          // Resolve plan content: prefer file on disk, fall back to arg
          let planContent = args.plan || "";
          const planFilePath = resolvedPlanFilePath || `${ctx.directory}/${DEFAULT_PLAN_FILE}`;

          if (!planContent) {
            try {
              const file = Bun.file(planFilePath);
              if (await file.exists()) {
                planContent = await file.text();
              }
            } catch {
              // File read failed, fall through
            }
          }

          if (!planContent.trim()) {
            return `Error: No plan content found. Either pass the plan as an argument or write it to ${planFilePath} first.`;
          }

          const server = await startPlannotatorServer({
            plan: planContent,
            origin: "opencode",
            sharingEnabled: await getSharingEnabled(),
            shareBaseUrl: getShareBaseUrl(),
            htmlContent,
            opencodeClient: ctx.client,
            onReady: async (url, isRemote, port) => {
              handleServerReady(url, isRemote, port);
              if (isRemote && await getSharingEnabled()) {
                await writeRemoteShareLink(planContent, getShareBaseUrl(), "review the plan", "plan only").catch(() => {});
              }
            },
          });

          const timeoutSeconds = getPlanTimeoutSeconds();
          const timeoutMs = timeoutSeconds === null ? null : timeoutSeconds * 1000;

          const result = timeoutMs === null
            ? await server.waitForDecision()
            : await new Promise<Awaited<ReturnType<typeof server.waitForDecision>>>((resolve) => {
                const timeoutId = setTimeout(
                  () =>
                    resolve({
                      approved: false,
                      feedback: `[Plannotator] No response within ${timeoutSeconds} seconds. Port released automatically. Please call submit_plan again.`,
                    }),
                  timeoutMs
                );

                server.waitForDecision().then((r) => {
                  clearTimeout(timeoutId);
                  resolve(r);
                });
              });
          await Bun.sleep(1500);
          server.stop();

          if (result.approved) {
            // Check agent switch setting
            const shouldSwitchAgent = result.agentSwitch && result.agentSwitch !== 'disabled';
            const targetAgent = result.agentSwitch || 'build';

            if (shouldSwitchAgent) {
              try {
                await ctx.client.tui.executeCommand({
                  body: { command: "agent_cycle" },
                });
              } catch {
                // Silently fail
              }

              try {
                await ctx.client.session.prompt({
                  path: { id: context.sessionID },
                  body: {
                    agent: targetAgent,
                    noReply: true,
                    parts: [{ type: "text", text: "Proceed with implementation" }],
                  },
                });
              } catch {
                // Silently fail if session is busy
              }
            }

            if (result.feedback) {
              return `Plan approved with notes!

Plan Summary: ${args.summary}
${result.savedPath ? `Saved to: ${result.savedPath}` : ""}

## Implementation Notes

The user approved your plan but added the following notes to consider during implementation:

${result.feedback}

Proceed with implementation, incorporating these notes where applicable.`;
            }

            return `Plan approved!

Plan Summary: ${args.summary}
${result.savedPath ? `Saved to: ${result.savedPath}` : ""}`;
          } else {
            return planDenyFeedback(result.feedback || "", "submit_plan", { planFilePath });
          }
        },
      }),
    },
  };
};

export default PlannotatorPlugin;
