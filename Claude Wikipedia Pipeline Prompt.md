You are working in the Propaedia repository root.

Your job is to continue the Wikipedia AI mapping pipeline safely and repeatably.

## Core Rule

- The canonical source of truth is the code in:
  - `scripts/generate-summary-ai.mjs`
  - `scripts/generate-mappings-ai.mjs`
- Read those files first.
- Obey the "IMPORTANT FOR CLAUDE CODE AGENTS" comments in those files.
- Do not invent your own one-off prompts for subagents.
- Do not generate mappings manually in chat.
- Do not bypass the workflow described in the scripts.

## What This Project Needs

- Wikipedia should map everywhere on its own.
- "Everywhere" means exact leaf-level Propaedia subsection coverage, not loose parent/child coverage.
- Controlled fallback is allowed only when there is no defensible exact leaf mapping:
  - a broader ancestor path may temporarily stand in for a missing exact leaf path
  - but fallback counts as debt, not full coverage
- Macropaedia is irrelevant to this task.

## Important Current State

- Wikipedia `summaryAI` is already complete.
- The Wikipedia article inventory is mostly already present in mappings.
- The main issue is that many Wikipedia path assignments were created with older logic and are too broad or outdated.
- The mapping pipeline has already been updated to:
  - normalize slash-style section codes for file IO
  - report exact leaf coverage per type
  - classify broader parent mappings as fallback rather than exact coverage
  - provide `gap-fill`, `repair-queue`, and `status` modes
- Generated audit outputs are written under `scripts/output/` when status, coverage, gap-fill, or repair-queue is run.
- Those JSON files are generated artifacts and do not need to be checked into the repo.

## Hard Instructions

1. Read these files before taking action:
   - `scripts/generate-summary-ai.mjs`
   - `scripts/generate-mappings-ai.mjs`
2. If you use subagents:
   - use the exact system prompts defined in those scripts
   - use the exact validation rules defined in those scripts
   - use the batching/workflow described in `scripts/generate-mappings-ai.mjs`
   - do not make up your own unrepeatable prompts
3. Prefer the existing scripts over inventing new pipeline logic.
4. Keep changes minimal and repeatable.
5. Do not overwrite unrelated user changes.
6. Do not delete existing data unless explicitly required.
7. Validate after each meaningful step.
8. Do not run everything at once. Work in batches and come back to check in before continuing so we do not burn through the full token allocation.
9. Do not jump straight to a full assign-all rerun. Wikipedia should be remapped first, then gap-filled, then only use targeted assign where still necessary.

## Your Immediate Objective

1. Establish current Wikipedia state with `status`.
2. Refresh Wikipedia path mappings using the current remap logic.
3. Validate the results.
4. Re-run exact leaf coverage audit.
5. Generate a Wikipedia gap-fill plan and repair queue.
6. Only then use targeted assign work for sections that still have unresolved leaf gaps or clearly wrong article coverage.

## Required Workflow

1. Inspect current Wikipedia summary and mapping state with `status`.
2. Run full Wikipedia remap with the current canonical script.
3. Run mapping validation.
4. Run exact leaf coverage audit.
5. Run Wikipedia gap-fill planning.
6. Run Wikipedia repair-queue planning.
7. Stop and report back.
8. Only after that, begin targeted assign/remap repair in batches.

## Commands You Should Likely Use

- `node scripts/generate-mappings-ai.mjs --mode status --type wikipedia`
- `node scripts/generate-mappings-ai.mjs --mode remap --all --type wikipedia`
- `node scripts/generate-mappings-ai.mjs --validate`
- `node scripts/generate-mappings-ai.mjs --coverage`
- `node scripts/generate-mappings-ai.mjs --mode gap-fill --type wikipedia`
- `node scripts/generate-mappings-ai.mjs --mode repair-queue --type wikipedia`

## What To Report Back

- exact Wikipedia leaf coverage before and after
- number of fallback-only and unresolved Wikipedia leaves before and after
- validation results, including invalid paths and empty `relevantPathsAI` counts
- repair-queue recommendation summary (`remap` vs `assign`)
- any sections that remain especially weak after remap
- exactly what commands were run
- any files changed

## If You Need Subagents For Scale

- first extract the canonical prompt text and validation rules from the scripts
- then build subagent work from those exact instructions
- then parse and write results back through the repo's established structures
- never freehand the prompts

Before making changes, briefly summarize:

- what the canonical files require
- what you are going to run first
- how you will avoid inventing non-repeatable prompts
- what batch size/check-in boundary you will use
