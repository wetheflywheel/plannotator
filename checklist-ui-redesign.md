# Checklist UI Redesign

## Source
QA checklist results from 2026-03-10. User tested the checklist feature against itself.
Saved at: `~/.plannotator/checklists/feat-skills-structure/checklist-feature-qa-verification-2026-03-10-1773177928397.json`

## Core Problem
The checklist editor was built as its own app (two-panel layout with detail sidebar) instead of adapting the plan review's artifact-centric pattern. It needs to feel like the plan review where the checklist is a **document artifact**, not a dashboard.

## Required Changes

### 1. Single-artifact view (like plan review)
- Remove the two-panel layout (list + detail sidebar)
- Checklist renders as a single-column artifact/document
- Items expand/collapse inline on click — show description, steps, reason, files when expanded
- Collapsed state: just the check headline with a transparent cutoff preview
- "Modern and elegant" — smooth expand/collapse animations

### 2. Annotations for notes (not hidden textareas)
- Use the existing annotation system from plan/review editors for item-specific notes
- Current notes feature is too hidden in the detail panel
- Match the annotation UX patterns across all three apps (plan, review, checklist)

### 3. Progress bar
- Keep it but make it small/thin
- Position it right above the checklist artifact
- Not a big standalone component

### 4. Hover states
- Current on-hover actions on list items are too noisy/messy
- Reduce hover surface area significantly
- Pass animation on status change is smooth and good — keep that

### 5. Keyboard shortcuts
- j/k navigation works but focus/selection behavior is confusing
- Need clearer visual feedback for which item is focused
- Status change via keyboard (p/f/s) needs to feel more direct

### 6. Copy all annotations
- Add copy-all button like the other apps have
- Basic convenience feature that's missing

### 7. Global notes
- Reconsider — takes up too much surface area
- May not be needed if annotations work well per-item

### 8. Skipped verification items
- Submit flow + markdown output (func-3)
- Disk persistence (func-4) — verified save works, --file reopen untested in full
- serve.ts extraction across all 4 servers (integ-1)
- Draft auto-save/restore (integ-2)
- Theme CSS extraction visual check (visual-1)
- Validation error messages (edge-1)
- Partial submit dialog (edge-2)
