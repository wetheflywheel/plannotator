/**
 * Red-team review tests.
 *
 * Run: bun test packages/server/red-team-review.test.ts
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runRedTeamReview } from "./red-team-review";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;
const ORIGINAL_HOME = process.env.HOME;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
});

describe("runRedTeamReview", () => {
  test("throws a clear error when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    // Point HOME at a temp dir so loadOpenRouterKey can't find ~/.env.shared
    process.env.HOME = "/tmp/plannotator-test-no-env-" + Date.now();

    await expect(runRedTeamReview("# A plan", "consensus")).rejects.toThrow(
      /OPENROUTER_API_KEY not set/,
    );
  });

  test("calls OpenRouter with the right shape and parses the response", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";

    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: "  The council missed an important race condition.  " } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const plan = "# Migration Plan\n\nDrop the table, restore from backup.";
    const consensus = "Looks good — proceed.";
    const result = await runRedTeamReview(plan, consensus);

    // Endpoint
    expect(String(capturedUrl)).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );

    // Method + auth
    expect(capturedInit?.method).toBe("POST");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-or-test-key");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Title"]).toBe("plannotator-red-team");
    expect(headers["HTTP-Referer"]).toBe(
      "https://github.com/backnotprop/plannotator",
    );

    // Body
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.model).toBe("openai/gpt-4.1-mini");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(800);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("adversarial reviewer");
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain(plan);
    expect(body.messages[1].content).toContain(consensus);
    expect(body.messages[1].content).toContain("What did the council miss?");

    // Result shape
    expect(result.modelId).toBe("openai/gpt-4.1-mini");
    expect(result.findings).toBe(
      "The council missed an important race condition.",
    );
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("throws when OpenRouter returns a non-2xx response", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    globalThis.fetch = (async () =>
      new Response("rate limited", { status: 429 })) as typeof fetch;

    await expect(runRedTeamReview("# A plan", "consensus")).rejects.toThrow(
      /OpenRouter API error: 429/,
    );
  });

  test("throws when the response has no content", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await expect(runRedTeamReview("# A plan", "consensus")).rejects.toThrow(
      /No response from adversarial review model/,
    );
  });
});
