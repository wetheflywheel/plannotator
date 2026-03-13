# Pi Skills in Extensions

Pi extensions can bundle skills alongside extension code via `package.json`:

```json
{
  "pi": {
    "extensions": ["./"],
    "skills": ["./skills"]
  }
}
```

When a user runs `pi install npm:@plannotator/pi-extension`, both the extension and skills are loaded.

## Discovery Locations (in order)
- Global: `~/.pi/agent/skills/`
- Project: `.pi/skills/` (up to git root)
- Packages: `skills/` dir or `pi.skills` entries in `package.json`
- Settings / CLI flags

## Skills vs Extensions
- **Skills**: Markdown (SKILL.md), model reads & follows instructions, stateless, workflows/prompts
- **Extensions**: TypeScript, code runs in the system, can maintain state, tools/events/UI/state machines

## Invocation
- **Automatic**: Descriptions in system prompt, model reads full SKILL.md via read tool when task matches
- **Manual**: `/skill:name [args]`
- **Hidden**: `disable-model-invocation: true` in frontmatter (slash command only)

## Structure in pi-extension
```
apps/pi-extension/
├── index.ts
├── server.ts
├── package.json          # pi.skills: ["./skills"]
└── skills/
    └── checklist-review/
        └── SKILL.md
```
