# Goki - Agent Execution & Delegation Policy

## 1. Direct Execution as Strict Default
The primary agent executes tasks directly (reading, creating, modifying files, running tests, and executing commands).

The primary agent must **NEVER** spawn subagents or delegate to `flash-worker` for:
- Single-workspace or single-package tasks.
- UI revisions, styling, layout, or component adjustments.
- Bug fixes, diagnostics, and troubleshooting.
- Tasks touching 3 or fewer files.
- Any routine development or refactoring task.

## 2. Explicit / High-Complexity Gate for Subagents
Delegating to `flash-worker` via `invoke_subagent` is **STRICTLY GATED** and may ONLY be used when at least one of the following conditions is met:
1. **Explicit Prompt Instruction:** The user explicitly requests subagent delegation by including `"use subagents"` or `"@delegate"` in their prompt.
2. **High-Complexity Multi-Package Feature:** The feature spans 3 or more workspaces (`@goki/game-engine`, `@goki/database`, `@goki/server`, `@goki/mobile`) AND requires parallel multi-package implementation.

If neither condition is explicitly satisfied, the primary agent MUST perform the work directly.

## 3. Delegation Protocol (When Gate Criteria Are Met)
When delegation is permitted:
- Delegate execution to `flash-worker` via `invoke_subagent`.
- Provide a structured Work Order containing:
  1. Exact target file paths.
  2. Function/interface signatures and edge cases to handle.
  3. The exact test or lint command `flash-worker` must run to verify its work.

---

## 4. Fast Execution & Context Hygiene
- **Never Read Heavy/Asset Files:** Never read `apps/mobile/src/assets/v0Vault.ts`, `apps/mobile/assets/sprites/index.ts`, or scan `apps/mobile/assets/` image directories unless explicitly requested.
- **Targeted Slicing for Large Files:** When inspecting large files (>500 lines such as `CharacterProfileScreen.tsx`, `WorkoutLoggerScreen.tsx`, `AutoBattlerArena.tsx`, `GameContext.tsx`, `talent-engine.ts`, `item-affix-engine.ts`, `schema.prisma`), ALWAYS use targeted `grep` first and read only the relevant ~100-line slice (`startLine`/`endLine`) rather than reading the entire file.
- **Minimal Verification Scope:** For targeted UI or single-workspace edits, do NOT run full-monorepo `npm run build` or full test suites; run only `npx tsc --noEmit -p apps/mobile/tsconfig.json` (or the single affected workspace) when verification is needed.
