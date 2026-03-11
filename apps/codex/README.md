# Plannotator for Codex

## Capabilities

| Feature | How to use |
|---------|------------|
| **Code Review** | `!plannotator review` — Visual diff annotation UI |
| **Markdown Annotation** | `!plannotator annotate path/to/file.md` — Annotate any markdown file |
| **QA Checklist** | Skill: `checklist` — Generate and verify QA checklists interactively |

Plan mode is not yet supported — it requires hooks to intercept the agent's plan submission, which Codex does not currently expose.

## Install

**macOS / Linux / WSL:**

```bash
curl -fsSL https://plannotator.ai/install.sh | bash
```

**Windows PowerShell:**

```powershell
irm https://plannotator.ai/install.ps1 | iex
```

This installs the `plannotator` CLI and places skills in `~/.agents/skills/` where Codex discovers them on startup. To install skills only: `npx skills add backnotprop/plannotator`.

## Usage

### Code Review

```
!plannotator review
```

Captures your git diff, opens a browser with the review UI, and waits for your feedback. Annotations are sent back to the agent as structured feedback.

### Annotate Markdown

```
!plannotator annotate path/to/file.md
```

### QA Checklist

The `checklist` skill is invoked by the agent when you ask it to verify changes, create acceptance criteria, or run QA checks. It generates a structured checklist and opens an interactive UI for pass/fail/skip verification.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PLANNOTATOR_REMOTE` | Set to `1` for remote mode (devcontainer, SSH). Uses fixed port and skips browser open. |
| `PLANNOTATOR_PORT` | Fixed port to use. Default: random locally, `19432` for remote sessions. |
| `PLANNOTATOR_BROWSER` | Custom browser to open. macOS: app name or path. Linux/Windows: executable path. |

## Links

- [Website](https://plannotator.ai)
- [GitHub](https://github.com/backnotprop/plannotator)
- [Docs](https://plannotator.ai/docs/getting-started/installation/)
