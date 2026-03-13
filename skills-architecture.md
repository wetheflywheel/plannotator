# Skills Architecture

## Canonical Location
- `.agents/skills/<name>/SKILL.md` (Agent Skills standard, repo root)
- First skill: `checklist-review`

## Distribution Model
- Full-suite harnesses bundle skills with their plugin/extension install
- Skills-only harnesses (Codex, Factory) use `npx skills add backnotprop/plannotator`

## Per-Harness Bundling
- **Claude Code**: Plugin bundles skills in plugin `skills/` dir
- **OpenCode**: npm plugin bundles skills in package
- **Pi**: Extension bundles skills via `pi.skills` in `package.json` — see [pi-skills.md](pi-skills.md)
- **Codex**: `npx skills add backnotprop/plannotator`
- **Factory**: `npx skills add backnotprop/plannotator`

## Vercel `skills` CLI
- `npx skills add backnotprop/plannotator`
- Scans `.agents/skills/`, `skills/`, `.claude/skills/`, plugin manifests
- Auto-detects installed agents, symlinks skills to each agent's skill dir
- Supports 41+ agents
