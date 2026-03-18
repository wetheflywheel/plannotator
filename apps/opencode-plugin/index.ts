/**
 * Plannotator Plugin for OpenCode
 *
 * Provides interactive browser-based plan review via two tools:
 * - submit_plan(plan): Submit plan text directly for review (works from any agent)
 * - submit_plan_file(path): Submit a plan file from disk for review (for file-based workflows)
 *
 * The agent chooses which tool fits the context. Both open the same review UI.
 *
 * Environment variables:
 *   PLANNOTATOR_REMOTE - Set to "1" or "true" for remote mode (devcontainer, SSH)
 *   PLANNOTATOR_PORT   - Fixed port to use (default: random locally, 19432 for remote)
 *   PLANNOTATOR_PLAN_TIMEOUT_SECONDS - Max wait for approval (default: 345600, set 0 to disable)
 *   PLANNOTATOR_ALLOW_SUBAGENTS - Set to "1" to allow subagents to see plan tools
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
import { writeRemoteShareLink } from "@plannotator/server/share-url";
import {
  handleReviewCommand,
  handleAnnotateCommand,
  handleAnnotateLastCommand,
  type CommandDeps,
} from "./commands";
import { planDenyFeedback } from "@plannotator/shared/feedback-templates";
import {
  getPlanDirectory,
  validatePlanPath,
  stripConflictingPlanModeRules,
} from "./plan-mode";

// @ts-ignore - Bun import attribute for text
import indexHtml from "./plannotator.html" with { type: "text" };
const htmlContent = indexHtml as unknown as string;

// @ts-ignore - Bun import attribute for text
import reviewHtml from "./review-editor.html" with { type: "text" };
const reviewHtmlContent = reviewHtml as unknown as string;

const DEFAULT_PLAN_TIMEOUT_SECONDS = 345_600; // 96 hours

const PLAN_TOOLS = ["submit_plan", "submit_plan_file"];

// ── Planning prompt ───────────────────────────────────────────────────────

/**
 * Unified planning prompt injected for all primary agents (not just plan mode).
 *
 * Design principles (from skill-creator methodology):
 * - Explain the WHY, not just the what — the model is smart, give it context
 * - Keep it lean — every line should pull its weight
 * - Don't overfit — let the agent and user dictate the workflow
 * - Trust the model — no redundant summaries or heavy-handed MUSTs
 */
function getPlanningPrompt(planDir: string): string {
  return `## Plannotator — Plan Review

You have two plan submission tools. Both open the same interactive review UI where the user can annotate, approve, or request changes.

**\`submit_plan(plan)\`** — Pass the plan as markdown text. Use this for most planning tasks — it's simple and works from any agent. Good for quick plans, iterative planning sessions, or when the user hasn't asked for file-based plans.

**\`submit_plan_file(path)\`** — Pass an absolute path to a plan file on disk. Use this when the user wants plans persisted as files, or for long/complex plans that benefit from file-based editing. Write plan files to \`${planDir}\`.

Let the context guide which tool to use. If the user asks you to write a plan to a file, use \`submit_plan_file\`. If the user just asks you to plan something, \`submit_plan\` is usually the right choice.

### Planning well

Before writing a plan, understand what you're planning for. Read the relevant code, trace dependencies, and look at existing patterns. The depth of exploration should match the task — a vague feature request needs more research than a focused bug fix.

If you need information only the user can provide (requirements, preferences, tradeoffs), ask using the \`question\` tool.

### When the plan is rejected

The user's annotated feedback tells you what to change. Revise and resubmit using the same tool you used before. If you used \`submit_plan_file\`, edit the same file and resubmit its path.

### What NOT to do

- Don't proceed with implementation until the plan is approved.
- Don't use \`plan_exit\` — it's been replaced by the submit tools above.
- Don't end your turn without either submitting a plan or asking the user a question.`;
}

// ── Shared server helpers ─────────────────────────────────────────────────

interface PlanServerDeps {
  getSharingEnabled: () => Promise<boolean>;
  getShareBaseUrl: () => string | undefined;
  getPlanTimeoutSeconds: () => number | null;
  client: any;
}

async function startPlanServer(
  planContent: string,
  deps: PlanServerDeps,
) {
  const sharingEnabled = await deps.getSharingEnabled();
  return startPlannotatorServer({
    plan: planContent,
    origin: "opencode",
    sharingEnabled,
    shareBaseUrl: deps.getShareBaseUrl(),
    htmlContent,
    opencodeClient: deps.client,
    onReady: async (url, isRemote, port) => {
      handleServerReady(url, isRemote, port);
      if (isRemote && sharingEnabled) {
        await writeRemoteShareLink(planContent, deps.getShareBaseUrl(), "review the plan", "plan only").catch(() => {});
      }
    },
  });
}

async function waitForDecision(
  server: Awaited<ReturnType<typeof startPlannotatorServer>>,
  timeoutSeconds: number | null,
) {
  const timeoutMs = timeoutSeconds === null ? null : timeoutSeconds * 1000;

  const result = timeoutMs === null
    ? await server.waitForDecision()
    : await new Promise<Awaited<ReturnType<typeof server.waitForDecision>>>((resolve) => {
        const timeoutId = setTimeout(
          () =>
            resolve({
              approved: false,
              feedback: `[Plannotator] No response within ${timeoutSeconds} seconds. Port released automatically. Please call the submit tool again.`,
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
  return result;
}

async function handleApproval(
  result: Awaited<ReturnType<typeof startPlannotatorServer>>["waitForDecision"] extends () => Promise<infer R> ? R : never,
  context: { sessionID: string },
  client: any,
  savedPath?: string,
) {
  const shouldSwitchAgent = result.agentSwitch && result.agentSwitch !== 'disabled';
  const targetAgent = result.agentSwitch || 'build';

  if (shouldSwitchAgent) {
    try {
      await client.tui.executeCommand({
        body: { command: "agent_cycle" },
      });
    } catch {
      // Silently fail
    }

    try {
      await client.session.prompt({
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
${savedPath ? `Saved to: ${savedPath}` : ""}

## Implementation Notes

The user approved your plan but added the following notes to consider during implementation:

${result.feedback}

Proceed with implementation, incorporating these notes where applicable.`;
  }

  return `Plan approved!${savedPath ? ` Saved to: ${savedPath}` : ""}`;
}

// ── Plugin ────────────────────────────────────────────────────────────────

export const PlannotatorPlugin: Plugin = async (ctx) => {
  let cachedAgents: any[] | null = null;

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

  const serverDeps: PlanServerDeps = {
    getSharingEnabled,
    getShareBaseUrl,
    getPlanTimeoutSeconds,
    client: ctx.client,
  };

  return {
    // Register plan tools as primary-only (hidden from sub-agents by default)
    config: async (opencodeConfig) => {
      if (!allowSubagents()) {
        const existingPrimaryTools = opencodeConfig.experimental?.primary_tools ?? [];
        const toolsToAdd = PLAN_TOOLS.filter(t => !existingPrimaryTools.includes(t));
        if (toolsToAdd.length > 0) {
          opencodeConfig.experimental = {
            ...opencodeConfig.experimental,
            primary_tools: [...existingPrimaryTools, ...toolsToAdd],
          };
        }
      }

      // Allow the plan agent to write .md files anywhere.
      // OpenCode's built-in plan agent uses relative-path globs that break
      // when worktree != cwd (non-git projects). Per-agent config merges
      // last, so this only affects the plan agent.
      opencodeConfig.agent ??= {};
      opencodeConfig.agent.plan ??= {};
      opencodeConfig.agent.plan.permission ??= {};
      opencodeConfig.agent.plan.permission.edit = {
        ...opencodeConfig.agent.plan.permission.edit,
        "*.md": "allow",
      };
    },

    // Strip OpenCode's "STRICTLY FORBIDDEN" plan mode prompt from synthetic
    // user messages. OpenCode injects these to prevent file edits in plan mode,
    // but we need the agent to be able to write plan files.
    "experimental.chat.messages.transform": async (input, output) => {
      for (const message of output.messages) {
        if (message.info.role !== "user") continue;
        message.parts = message.parts.filter(
          (part: any) => !(part.type === "text" && part.text?.includes("STRICTLY FORBIDDEN"))
        );
      }
    },

    // Suppress plan_exit — redirect to submit_plan / submit_plan_file
    "tool.definition": async (input, output) => {
      if (input.toolID === "plan_exit") {
        output.description =
          "Do not call this tool. Use submit_plan or submit_plan_file instead — they open a visual review UI for plan approval.";
      }
    },

    // Inject planning instructions into system prompt
    "experimental.chat.system.transform": async (input, output) => {
      const systemText = output.system.join("\n");
      if (systemText.toLowerCase().includes("title generator") || systemText.toLowerCase().includes("generate a title")) {
        return;
      }

      let lastUserAgent: string | undefined;
      try {
        const messagesResponse = await ctx.client.session.messages({
          // @ts-ignore - sessionID exists on input
          path: { id: input.sessionID }
        });
        const messages = messagesResponse.data;

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

        if (!lastUserAgent) return;

        // Build agent doesn't need planning instructions
        if (lastUserAgent === "build") return;

        // Cache agents list (static per session)
        if (!cachedAgents) {
          const agentsResponse = await ctx.client.app.agents({
            query: { directory: ctx.directory }
          });
          cachedAgents = agentsResponse.data ?? [];
        }
        const agent = cachedAgents.find((a: { name: string }) => a.name === lastUserAgent);

        // Skip sub-agents
        // @ts-ignore - Agent has mode field
        if (agent?.mode === "subagent") return;

      } catch {
        return;
      }

      // Plan agent: strip conflicting OpenCode rules, inject full prompt
      if (lastUserAgent === "plan") {
        const planDir = getPlanDirectory();
        output.system = stripConflictingPlanModeRules(output.system);
        output.system.push(getPlanningPrompt(planDir));
        return;
      }

      // Other primary agents: same prompt (uniform experience)
      const planDir = getPlanDirectory();
      output.system.push(getPlanningPrompt(planDir));
    },

    // Intercept plannotator-last before the agent sees the command
    "command.execute.before": async (input, output) => {
      if (input.command !== "plannotator-last") return;

      output.parts = [];

      const deps: CommandDeps = {
        client: ctx.client,
        htmlContent,
        reviewHtmlContent,
        getSharingEnabled,
        getShareBaseUrl,
        directory: ctx.directory,
      };

      const feedback = await handleAnnotateLastCommand(
        { properties: { sessionID: input.sessionID } },
        deps
      );

      if (feedback) {
        try {
          await ctx.client.session.prompt({
            path: { id: input.sessionID },
            body: {
              parts: [{
                type: "text",
                text: `# Message Annotations\n\n${feedback}\n\nPlease address the annotation feedback above.`,
              }],
            },
          });
        } catch {
          // Session may not be available
        }
      }
    },

    // Listen for slash commands (review + annotate)
    event: async ({ event }) => {
      const isCommandEvent =
        event.type === "command.executed" ||
        event.type === "tui.command.execute";

      if (!isCommandEvent) return;

      // @ts-ignore - Event structure varies
      const commandName = event.properties?.name || event.command || event.payload?.name;

      const deps: CommandDeps = {
        client: ctx.client,
        htmlContent,
        reviewHtmlContent,
        getSharingEnabled,
        getShareBaseUrl,
        directory: ctx.directory,
      };

      if (commandName === "plannotator-review")
        return handleReviewCommand(event, deps);
      if (commandName === "plannotator-annotate")
        return handleAnnotateCommand(event, deps);
    },

    tool: {
      // ── submit_plan: text-based (the original, works uniformly) ──────
      submit_plan: tool({
        description:
          "Submit a plan for interactive user review. Pass the complete plan as markdown text. The user can annotate, approve, or request changes in a visual review UI. Use this for most planning tasks.",
        args: {
          plan: tool.schema
            .string()
            .describe("The complete implementation plan in markdown format."),
        },

        async execute(args, context) {
          const server = await startPlanServer(args.plan, serverDeps);
          const result = await waitForDecision(server, getPlanTimeoutSeconds());

          if (result.approved) {
            return handleApproval(result, context, ctx.client, result.savedPath);
          }
          return planDenyFeedback(result.feedback || "", "submit_plan");
        },
      }),

      // ── submit_plan_file: file-based (for persistent plan workflows) ─
      submit_plan_file: tool({
        description:
          "Submit a plan file from disk for interactive user review. Pass the absolute path to a markdown file. Use this when the user wants plans saved as files, or for long plans that benefit from file-based editing. The review UI is the same as submit_plan.",
        args: {
          path: tool.schema
            .string()
            .describe("Absolute path to the plan markdown file on disk."),
        },

        async execute(args, context) {
          const planDir = getPlanDirectory();
          const validation = validatePlanPath(args.path, planDir);

          if (!validation.ok) {
            return `Error: ${validation.error}`;
          }

          const server = await startPlanServer(validation.content, serverDeps);
          const result = await waitForDecision(server, getPlanTimeoutSeconds());

          if (result.approved) {
            return handleApproval(result, context, ctx.client, result.savedPath);
          }
          return planDenyFeedback(result.feedback || "", "submit_plan_file", { planFilePath: args.path });
        },
      }),
    },
  };
};

export default PlannotatorPlugin;
