---
title: AI Features
description: "How to use Plannotator's inline AI chat during code review — provider setup, model selection, and how it works."
sidebar:
  order: 25
section: "Guides"
---

Plannotator embeds an AI chat sidebar directly in the code review UI. You can select lines in a diff, ask questions, and get streaming responses. The AI sees the full diff context automatically, so you can ask things like "explain this change" or "is this safe?" without copy-pasting code.

## Supported providers

### Claude (via Claude Agent SDK)

Requires the `claude` CLI installed and authenticated. Uses Claude Code's full system prompt, so the AI has the same capabilities as a Claude Code session — file reading, search, web access — plus the diff context.

**Models:**

- Sonnet 4.6 (default)
- Opus 4.6
- Haiku 4.5

### Codex (via Codex SDK)

Requires the `codex` CLI installed and authenticated. The AI operates in a sandboxed read-only mode with the diff context injected as a system prompt prefix.

**Models:**

- GPT-5.4 (default)
- GPT-5.4 Mini
- GPT-5.3 Codex
- GPT-5.3 Codex Spark
- GPT-5.2 Codex
- GPT-5.2

## Configuration

Provider and model selection is available in **Settings > AI**. These persist via cookies across sessions.

You can also override the provider and model per-session using the config bar at the bottom of the AI sidebar. Changing the provider or model starts a new session — old messages stay visible but the conversation resets.

## How it works

A session is created lazily on your first question. Until then, no resources are used.

**Claude sessions** use `{ preset: "claude_code" }` with the review context appended. This means the AI has full Claude Code capabilities (tool use, file reading, search) plus the diff. If the code review was launched from a Claude Code session, the AI can fork from the parent session, preserving conversation history.

**Codex sessions** inject the review context as a system prompt prefix. The AI has Codex's built-in capabilities plus the diff. Codex sessions are always standalone — fork support is not available.

**Diff context handling:** Large diffs are truncated at roughly 40k characters to stay within context limits. However, when you select specific lines and ask a question, the selected code is always sent alongside the question regardless of truncation.

## Permission requests

When using Claude, the AI may request permission to use tools like Read, Glob, Grep, or WebSearch. When this happens, an approval card appears inline in the chat. You can approve or deny each request individually.

Codex sessions run in a sandboxed read-only mode, so permission requests do not apply.

## Reasoning effort

Codex supports a reasoning effort setting with four levels: **Low**, **Medium**, **High**, and **Max**. This is available in the config bar at the bottom of the AI sidebar. Higher effort means slower but more thorough responses.

This setting only applies to Codex — Claude does not expose a reasoning effort control.

## Available settings

| Setting | Description | Provider |
|---------|-------------|----------|
| Provider | Claude or Codex | Both |
| Model | Model selection per provider | Both |
| Reasoning effort | Low / Medium / High / Max | Codex only |
| Default tools | Read, Glob, Grep, WebSearch | Claude only |
| Sandbox mode | Read-only | Codex only |
| Permission mode | Default | Claude only |
| Max turns | 99 | Both |
