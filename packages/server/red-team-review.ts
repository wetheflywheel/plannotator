/**
 * Adversarial ("red-team") review.
 *
 * Runs ONE cheap/fast model AFTER the multi-LLM council reaches consensus,
 * with the explicit job of finding what the council missed: edge cases,
 * hidden assumptions, failure modes, second-order effects.
 *
 * This is NOT a blocker — it never delays approval. The pill in the UI
 * fires this fetch-and-forget after `applyFeedback()` succeeds, then
 * surfaces results into the AutoReviewConsole drawer when they arrive.
 *
 * Mirrors the OpenRouter call pattern used by `/api/apply-review`
 * (same headers, same key-loading) for consistency.
 */

import { resolve } from "path";
import { homedir } from "os";

const MODEL_ID = "openai/gpt-4.1-mini";
const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 800;
const TEMPERATURE = 0.7;

const SYSTEM_PROMPT = `You are an adversarial reviewer. A council of multiple models reviewed this implementation plan and reached consensus. Your job is to find what they missed: edge cases, hidden assumptions, failure modes, second-order effects, and risks they glossed over.

Be specific and concrete. Reference parts of the plan directly. If you genuinely find no significant issues, say so plainly — do not invent problems for the sake of contributing.

Output 1-3 short paragraphs of plain markdown. No headings. No bullet points unless absolutely necessary.`;

export interface RedTeamReviewResult {
  findings: string;
  modelId: string;
  durationMs: number;
}

export interface RedTeamStreamCallbacks {
  /** Called for each text chunk as the model emits it. */
  onChunk: (chunk: string) => void;
  /** Called once when the stream completes successfully. */
  onDone: (result: { modelId: string; durationMs: number }) => void;
  /** Called when the stream errors or aborts. */
  onError: (err: Error) => void;
}

/** Constant model id — exported so callers can reference it without re-running the call. */
export const RED_TEAM_MODEL_ID = MODEL_ID;

/**
 * Resolve OPENROUTER_API_KEY from process.env, then ~/.env.shared.
 *
 * Kept module-private and identical in shape to `loadOpenRouterKey` in
 * server/index.ts. Duplicated rather than imported to keep this module
 * standalone and easy to test.
 */
async function loadOpenRouterKey(): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const home = process.env.HOME || homedir();
  for (const envPath of [
    resolve(home, "opt/security-mgmt/.env.shared"),
    resolve(home, ".env.shared"),
  ]) {
    try {
      const content = await Bun.file(envPath).text();
      for (const line of content.split("\n")) {
        if (line.startsWith("OPENROUTER_API_KEY=")) {
          return line.split("=", 2)[1].trim().replace(/^['"]|['"]$/g, "");
        }
      }
    } catch {
      /* file not found */
    }
  }
  return null;
}

/**
 * Run the adversarial pass against the council's consensus.
 *
 * @throws Error with a clear message when the API key is missing or the
 *   OpenRouter call fails. Callers should swallow these — red-team failure
 *   must never block the approval flow.
 */
export async function runRedTeamReview(
  plan: string,
  councilConsensus: string,
): Promise<RedTeamReviewResult> {
  const apiKey = await loadOpenRouterKey();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY not set — adversarial review requires an OpenRouter API key in env or ~/.env.shared",
    );
  }

  const userMessage = `Plan:
${plan}

Council consensus / applied feedback:
${councilConsensus}

What did the council miss?`;

  const startedAt = Date.now();

  const orResponse = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/backnotprop/plannotator",
        "X-Title": "plannotator-red-team",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );

  if (!orResponse.ok) {
    const errBody = await orResponse.text().catch(() => "");
    throw new Error(
      `OpenRouter API error: ${orResponse.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
    );
  }

  const orData = (await orResponse.json()) as {
    choices?: { message?: { content?: string } }[];
    content?: string;
  };
  const findings =
    orData.choices?.[0]?.message?.content ||
    orData.content ||
    (typeof orData === "string" ? orData : null);

  if (!findings) {
    throw new Error("No response from adversarial review model");
  }

  return {
    findings: findings.trim(),
    modelId: MODEL_ID,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Streaming variant — emits text chunks via the supplied callbacks as
 * OpenRouter produces them. SSE handler in index.ts wraps this.
 *
 * Errors are reported via `onError`; the function never throws after the
 * initial key/validation step so the SSE stream stays healthy.
 */
export async function runRedTeamReviewStreaming(
  plan: string,
  councilConsensus: string,
  cb: RedTeamStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let apiKey: string | null;
  try {
    apiKey = await loadOpenRouterKey();
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }
  if (!apiKey) {
    cb.onError(
      new Error(
        "OPENROUTER_API_KEY not set — adversarial review requires an OpenRouter API key in env or ~/.env.shared",
      ),
    );
    return;
  }

  const userMessage = `Plan:
${plan}

Council consensus / applied feedback:
${councilConsensus}

What did the council miss?`;

  const startedAt = Date.now();
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const composedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  try {
    const orResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/backnotprop/plannotator",
          "X-Title": "plannotator-red-team-stream",
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
          stream: true,
        }),
        signal: composedSignal,
      },
    );

    if (!orResponse.ok || !orResponse.body) {
      const errBody = await orResponse.text().catch(() => "");
      cb.onError(
        new Error(
          `OpenRouter API error: ${orResponse.status}${errBody ? ` — ${errBody.slice(0, 200)}` : ""}`,
        ),
      );
      return;
    }

    const reader = orResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) cb.onChunk(delta);
        } catch {
          // Ignore malformed SSE lines (heartbeats etc.)
        }
      }
    }

    cb.onDone({ modelId: MODEL_ID, durationMs: Date.now() - startedAt });
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
