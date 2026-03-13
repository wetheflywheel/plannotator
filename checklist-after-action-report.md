# Checklist Review — After Action Report

Structured against the original implementation plan. Each section notes what was planned, what was implemented, and any divergences.

---

## Naming Conventions

**Planned:** Standardized on `checklist` everywhere.

**Implemented:** Exactly as planned. All layers use `checklist`:
- Skill: `.agents/skills/checklist/SKILL.md`
- CLI: `plannotator checklist`
- Slash command: `/plannotator-checklist`
- App: `apps/checklist/`
- Package: `packages/checklist-editor/`
- Server: `packages/server/checklist.ts`
- Built HTML: `checklist.html`

**Note:** The original skill stub was at `.agents/skills/checklist-review/` — renamed to `.agents/skills/checklist/` during implementation.

---

## 1. Data Model

**Planned:** `ChecklistItem` with `id`, `category` (free-form string), `check`, `description`, `steps` (required), `reason`, `files?`, `critical?`. Response model with `ChecklistItemResult` (status, notes, images) and `ChecklistSubmission`.

**Implemented:** Exactly as planned in `packages/shared/checklist-types.ts` (49 lines). One divergence:

- **Divergence:** `ImageAttachment` type was inlined as `{ path: string; name: string }[]` instead of importing from `@plannotator/ui/types`. This was intentional — importing `@plannotator/ui` from `@plannotator/shared` would create a circular dependency since `@plannotator/ui` already depends on `@plannotator/shared`.

---

## 2. SKILL.md

**Planned:** Full narrative-driven skill following the code-simplifier pattern. Role as senior QA engineer, 5-step workflow, JSON schema inline, quality guidelines.

**Implemented:** 127-line skill at `.agents/skills/checklist/SKILL.md`. Follows the plan:
- Framed as "QA Checklist" with unmistakable QA intent
- Principles section (focus on human verification, be specific, every item is a mini test case, fewer good items)
- 5-step workflow: Gather Context → Decide What Needs Verification → Generate JSON → Launch UI → Respond to Results
- Full JSON schema embedded with field-by-field guidance
- Quality guidelines (5-15 items, verb-first checks, critical only for data loss/security/deploy)

**Divergence:** The skill description was made more "triggerable" per the skill-creator pattern — includes explicit trigger phrases like "create a checklist", "what should I test", "QA this", "pre-flight check". This wasn't in the original plan but follows best practice.

---

## 3. Server Layer

**Planned:** `packages/server/checklist.ts` following `annotate.ts` pattern. Endpoints: `/api/checklist`, `/api/feedback`, `/api/image`, `/api/upload`, `/api/draft`. Validation function. Feedback markdown formatter. Storage to `~/.plannotator/checklists/`.

**Implemented:** 376-line server. All planned endpoints implemented. Validation and feedback formatting both present.

**Divergences:**
- **Storage not implemented.** The plan called for saving checklists to `~/.plannotator/checklists/{project}/`. The server does not persist checklists to disk on arrival. Draft persistence (via `/api/draft`) is implemented for crash recovery, but no permanent storage. This is a gap — checklist history is not tracked.
- **No `getRepoInfo()` call.** The annotate server calls `getRepoInfo()` for context; the checklist server skips it. Minor — checklist doesn't need repo metadata in the API response.

---

## 4. CLI — `plannotator checklist`

**Planned:** Fifth subcommand in `apps/hook/server/index.ts`. JSON from CLI arg or `--file` flag. Validation → server start → session register → wait → feedback to stdout.

**Implemented:** Exactly as planned. 65-line branch added. Supports both `plannotator checklist '<json>'` and `plannotator checklist --file <path>`. Validation errors print to stderr with schema hint. Session registered as `mode: "checklist"`.

**No divergences.**

---

## 5. UI — Checklist Editor

**Planned:** Item-centric layout with category groups on left, resizable detail panel on right. Progressive disclosure. Visual states mapped to existing palette. Keyboard shortcuts. Filter bar. Submit states. Component architecture: 7 components, 3 hooks, 1 util. Launch frontend-design skill.

**Implemented:** 1,976 lines across 12 files in `packages/checklist-editor/`. Frontend-design agent built all components.

| Component | Planned | Implemented | Lines |
|-----------|---------|-------------|-------|
| `App.tsx` | Main app with data fetch, state, submission | Yes, with demo data fallback | 583 |
| `ChecklistHeader.tsx` | Progress bar, filters, submit | Yes | 240 |
| `ChecklistItem.tsx` | Item card with status, hover actions | Yes | 76 |
| `ChecklistGroup.tsx` | Collapsible category with micro-progress | Yes | 86 |
| `ChecklistDetailPanel.tsx` | Full detail: description, steps, notes, images | Yes, with paste-to-upload | 267 |
| `StatusButton.tsx` | Pass/fail/skip buttons | Yes, includes StatusIcon and QuickActions | 146 |
| `ProgressBar.tsx` | Segmented bar | Yes | 50 |
| `GlobalNotes.tsx` | Collapsible notes | Yes | 41 |
| `useChecklistState.ts` | Core state management | Yes, with keyboard nav | 195 |
| `useChecklistDraft.ts` | Auto-save drafts | Yes, 500ms debounce | 132 |
| `useChecklistProgress.ts` | Derived statistics | Yes, with SubmitState enum | 77 |
| `exportChecklist.ts` | Markdown feedback formatter | Yes | 83 |

**Divergences:**
- **Paste-to-upload** in ChecklistDetailPanel — not in the plan, but a natural addition following the review editor pattern. Developer can paste screenshots directly into the notes area.
- **Demo data** embedded in App.tsx — plan mentioned "demo/fallback data" but didn't specify content. Implemented as an 8-item auth refactor checklist.
- **Filter bar** implemented in ChecklistHeader — plan specified "pill toggles per status, text search" and both are present.

---

## 6. Harness Integration

**Planned:** OpenCode event listener + command file. Pi registered command + Node-compatible server. Codex/Factory skill-only. Prerequisite: revisit local notes.

**Implemented:**

### OpenCode
- Event listener for `/plannotator-checklist` added to `apps/opencode-plugin/index.ts` (92 lines added)
- Imports checklist server, validates JSON, starts server, sends feedback via `ctx.client.session.prompt()`
- Command file created: `apps/opencode-plugin/commands/plannotator-checklist.md`
- HTML import with Bun text attribute for `checklist.html`

### Pi
- `/plannotator-checklist` command registered in `apps/pi-extension/index.ts` (59 lines added)
- Node-compatible server added to `apps/pi-extension/server.ts` (244 lines added)
- Includes duplicated `validateChecklist()` and `formatChecklistFeedback()` (necessary since Pi uses jiti/Node, not Bun)
- README updated with new command

### Codex / Factory
- No changes needed — skill-only, works via `plannotator checklist` bash call

**Divergences:**
- **Pi server duplication is larger than expected.** The plan noted "Node-compatible checklist server" — the implementation duplicated both validation and feedback formatting into `server.ts` (244 lines). This is consistent with how the existing review and plan servers are duplicated for Pi, but it's a maintenance concern.
- **Local notes were read** by the harness agent as prerequisite, confirming the skill registration approaches.

---

## 7. Build Pipeline

**Planned:** New `dev:checklist` and `build:checklist` scripts. Update `build:hook` to copy checklist HTML. Update `build:opencode` and `build:pi` to copy checklist HTML. Build order: `build:checklist` → `build:review` → `build:hook` → `build:opencode` / `build:pi`.

**Implemented:** All 4 `package.json` files updated:
- Root: `dev:checklist`, `build:checklist` added. `build` script updated to include `build:checklist`.
- Hook: copies `../checklist/dist/index.html` to `dist/checklist.html`
- OpenCode: copies `../hook/dist/checklist.html` to `./checklist.html`, added to `files` array
- Pi: copies `../hook/dist/checklist.html` to `checklist.html`, added to `files` array

**No divergences.**

---

## 8. App Entry (`apps/checklist/`)

**Planned:** `index.html`, `index.tsx`, `vite.config.ts`, `package.json` following `apps/review/` pattern.

**Implemented:** Exactly as planned. 4 files. Vite config on port 3002 with single-file build, aliases to `@plannotator/checklist-editor` and `@plannotator/ui`.

**No divergences.**

---

## Summary of Divergences

| Area | Divergence | Impact |
|------|-----------|--------|
| Types | Inlined `ImageAttachment` instead of importing | Low — avoids circular dep, same shape |
| Skill | Added trigger phrases in description | Positive — better skill discoverability |
| Server | No persistent storage to `~/.plannotator/checklists/` | Medium — no checklist history tracking yet |
| UI | Added paste-to-upload in detail panel | Positive — better UX for screenshot evidence |
| Pi | Larger duplication than expected (validation + formatting) | Low — consistent with existing Pi pattern |

---

## Not Yet Verified

The plan's verification checklist (Section 9) has not been executed:
1. Skill → CLI end-to-end
2. UI interaction (pass/fail/skip/notes/images)
3. Feedback loop (stdout markdown)
4. Draft persistence
5. Slash command in Claude Code
6. Validation error messages
7. Remote mode
8. Full build pipeline

These are manual verification steps for the developer.

---

## File Inventory

**24 new files, 16 modified files, ~2,500 lines of new code.**

| Category | New | Modified |
|----------|-----|----------|
| Types | 1 | 0 |
| Skill | 1 | 0 |
| Server | 1 | 2 (sessions, package.json) |
| CLI | 0 | 1 |
| Commands | 2 | 0 |
| UI package | 12 | 0 |
| App entry | 4 | 0 |
| Build | 0 | 4 (package.json files) |
| Harness | 1 | 5 (opencode, pi index/server/readme) |
| Shared | 1 | 1 (package.json) |
| Scope doc | 1 | 0 |
| READMEs | 0 | 4 (from prior branch work) |
