# Checklist Review — Scope

**What it is:** A skill that instructs the agent to analyze the current diff/PR and generate a structured checklist of things the developer needs to manually verify — then launches an interactive UI for the developer to work through that checklist and submit feedback back to the agent.

## Three Layers

1. **Skill (SKILL.md)** — The agent reads the skill instructions, analyzes the diff in context, and produces a structured JSON checklist. The skill includes a JSON schema spec so the agent knows the exact format. No external validation step needed upfront — if the CLI rejects malformed JSON, the error message tells the agent what to fix.

2. **CLI command** — `plannotator checklist` (or similar subcommand). Takes the structured JSON as input, saves it to `~/.plannotator/checklists/`, starts a server, opens the browser UI. Same pattern as `plannotator review` and `plannotator annotate`.

3. **Interactive UI** — A new review surface in the Plannotator suite. The developer works through each checklist item and can: check things off, flag failures with notes, skip items with a reason, ask questions, attach images. Submission isn't approve/deny — it's "submit checklist." The ideal state is all green checks, but the UI supports the full QA spectrum. Exact feature set to be determined during planning with deep consideration of what makes a quality, general-purpose QA workflow.

## What the Checklist Covers

Not just code review. The agent generates checklist items across whatever the change touches — UI, API, CLI, backend, ML, integration points. The skill is dynamic — the agent decides what's relevant based on the actual diff, not a static template. A sub-agent will think deeply during planning about what constitutes quality QA that scales generally across project types.

## Integration with Existing Plannotator

- Same server architecture (random port, remote mode, VS Code extension compatibility)
- Same storage pattern (`~/.plannotator/checklists/` alongside `plans/`, `drafts/`, `history/`)
- Same image upload/attachment system
- Same cookie-based settings persistence
- Consistent visual language with plan review and code review UIs
- Same feedback-to-agent pipeline (stdout JSON for hooks, event handlers for plugins)

## Per-Harness Delivery

- **Claude Code** — skill bundled in plugin, CLI subcommand in hook server, called via bash
- **OpenCode** — skill registered via config hook, tool or event handler for the command
- **Pi** — skill bundled in extension, tool call to launch server
- **Codex/Factory** — skill installed globally, agent calls `plannotator checklist` via bash

## Not in Scope (Yet)

- Persistent checklist history/tracking across sessions
- Team-level checklist templates
- CI integration or automated checklist generation without an agent
- Restructuring existing commands into skills
