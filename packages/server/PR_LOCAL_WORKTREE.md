# PR Local Worktree — Design Notes

When reviewing a PR/MR via URL, create a temporary git worktree so the review agent has full local file access — without touching the user's current working tree.

## Problem

In PR mode today, the review server has no local file access. The diff comes from `gh pr diff`, file content from GitHub/GitLab API. This means:
- Codex can't read files, run git commands, or explore the codebase
- The agent is limited to analyzing the inlined diff text
- Review quality is degraded compared to local reviews

## Approach

New `--local` flag on the review command. When reviewing a PR with `--local`:

1. **Fetch the PR head** into the user's local repo (doesn't change their checkout):
   ```bash
   # GitHub
   git fetch origin refs/pull/123/head
   
   # GitLab  
   git fetch origin refs/merge-requests/42/head
   ```

2. **Create a temporary worktree** pointing at the fetched commit:
   ```bash
   git worktree add --detach /tmp/plannotator-pr-123-<short-uuid> FETCH_HEAD
   ```
   
   Detached HEAD — no branch created, no local branch pollution.

3. **Start the review server** with:
   - `gitContext.cwd` pointing to the worktree (not the user's working directory)
   - Full `gitContext` populated (branch info, diff options) — NOT pure PR mode
   - The diff computed locally: `git diff <baseSha>...<headSha>` in the worktree
   - Agent's `getCwd()` resolves to the worktree path
   
   The review server operates as if it were a local review, but in the worktree sandbox.

4. **Cleanup on shutdown** (default behavior):
   ```bash
   git worktree remove /tmp/plannotator-pr-123-<uuid> --force
   ```
   
   Wired into the existing `process.once("exit")` cleanup pattern.

## User Experience

```bash
# Pure remote PR review (current behavior, no local files)
plannotator review https://github.com/owner/repo/pull/123

# PR review with local worktree (agent gets full file access)
plannotator review https://github.com/owner/repo/pull/123 --local
```

The user's current checkout is completely untouched. They can be mid-work on their own branch. The worktree is created in `/tmp`, the review server runs there, and it's cleaned up when the review session ends.

## Prerequisites

- User must be in a clone of the same repository (or have the remote configured)
- `gh` / `glab` CLI authenticated (already required for PR mode)
- Git must support worktrees (any modern git)

## Edge Cases

- **GitHub fork PRs**: `refs/pull/N/head` is always fetchable from the upstream repo — works
- **GitLab cross-project MRs**: Depends on access permissions to the source project
- **Fetch failure**: Fall back to pure PR mode (no local files) with a warning
- **Worktree cleanup failure**: Log warning but don't block — orphaned `/tmp` dirs get cleaned by OS
- **User wants to keep worktree**: Future `--keep-worktree` flag, not default

## Implementation Location

- `apps/hook/server/index.ts` — parse `--local` flag, create worktree before `startReviewServer`
- New utility in `packages/shared/review-core.ts` or `packages/server/vcs.ts`:
  - `createPRWorktree(prMetadata, repoPath)` → `{ worktreePath, cleanup }`
- `packages/server/review.ts` — no changes needed, already supports custom `cwd` via `gitContext`

## Relationship to Agent Review

This dramatically improves Codex review quality for PRs:
- Agent runs in the worktree with full git + file access
- User message changes from "analyze this inlined diff" to "review the changes in this repo"
- Same review experience as local uncommitted changes
