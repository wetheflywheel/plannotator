# OpenCode Skills in Plugins

OpenCode plugins can bundle and register skills via the `config` hook during `Plugin.init()`.

## Config Hook

The config hook receives the full mutable `Config.Info` object:

```typescript
{
  command: Record<string, Command>   // slash commands
  skills: { paths: string[], urls: string[] }
}
```

A plugin can mutate both:

```typescript
const myPlugin: Plugin = async (input) => ({
  config: async (config) => {
    // Register a slash command
    config.command ??= {}
    config.command["my-command"] = {
      template: "Do something cool",
      description: "My custom command",
    }

    // Register skill paths/URLs
    config.skills ??= {}
    config.skills.paths ??= []
    config.skills.paths.push("/path/to/bundled/skills")
  },
  tool: { ... }
})
```

A single plugin can bundle all three extension types:
- **Tools** — via the `tool` hook directly
- **Slash commands** — via the config hook mutating `config.command`
- **Skills** — via the config hook mutating `config.skills` (pointing to bundled skill directories or URLs)

## Real-World Example

[opencode-snippets](https://github.com/JosXa/opencode-snippets/blob/741189a9/index.ts#L81) by JosXa:

```typescript
config: async (opencodeConfig) => {
  // Register bundled skills
  cfg.skills ??= {}
  cfg.skills.paths ??= []
  cfg.skills.paths.push(SKILL_DIR)  // points to bundled skill/ directory

  // Register slash command
  opencodeConfig.command ??= {}
  opencodeConfig.command.snippet = {
    template: "",
    description: "Manage text snippets (add, delete, list, help)",
  }
}
```

Command execution handled via `command.execute.before` hook.

## For Plannotator

The OpenCode plugin (`apps/opencode-plugin/index.ts`) already registers commands and tools. To add skills, add to the config hook:

```typescript
config.skills ??= {}
config.skills.paths ??= []
config.skills.paths.push(path.join(__dirname, "skills"))
```

Then bundle a `skills/` directory in the npm package alongside the existing code.
