---
name: surgical-code-editing
description: "Make small, safe, reviewable code changes. Use for bug fixes, refactors, file edits, diffs, and repository changes where existing behavior or user work must be preserved."
---

# Surgical Code Editing

## Procedure

1. Read applicable `AGENTS.md` files, the target file, and the directly related callers, types, tests, and build configuration before editing.
2. State the exact behavior to change and identify the smallest set of files needed. Reuse existing patterns and helpers.
3. Inspect the current worktree changes in every target file using available read-only tools. Preserve user edits; never overwrite or revert unrelated work.
4. Make a focused patch rather than replacing a whole file. Keep changes within the requested scope and the repository's file-size limit.
5. Preserve type safety. Avoid `any`, unsafe casts, silent catches, broad fallbacks, and undocumented behavior changes. Log or rethrow errors according to local conventions.
6. Check relevant call sites and user-visible surfaces so the behavior remains consistent. Update directly related documentation only when needed.
7. Review the final diff for unrelated edits, accidental secrets, generated files, and regressions. Do not touch `.env`, key files, `.git/`, or `node_modules/`.
8. Follow repository validation instructions. In this project, do not run npm, tsx, git, or shell commands; provide the narrow validation command for the user to run instead.
9. Report files changed, the reason for each change, validation performed or not performed, and any assumptions or remaining risks.

## Safety and project rules

- The repository's `AGENTS.md` is authoritative. Stop and report if requirements conflict with architecture, tests, or existing contracts.
- Before changing central contracts, inspect the declared types, core loop, planner, router, and their consumers; do not silently change downstream behavior.
- Never use destructive commands or discard user work.
