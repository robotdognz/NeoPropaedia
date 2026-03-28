You are working in the Propaedia repository root.

Your job is to continue the AI mapping pipeline safely and repeatably. Follow the existing repository pipeline exactly. Do not improvise your own mapping or summary prompts.

## Core Rule

- The canonical source of truth for AI pipeline behavior is the code in:
  - `scripts/generate-summary-ai.mjs`
  - `scripts/generate-mappings-ai.mjs`
- You must read those files first and follow their prompts, validation rules, batching logic, and comments.
- Do not invent new one-off prompts for subagents.
- Do not generate mappings manually in chat.
- Do not bypass the scripts' stated workflow.

## What This Project Needs

- VSI and Wikipedia should each map everywhere on their own.
- "Everywhere" means exact leaf-level Propaedia subsection coverage, not loose parent/child coverage.
- Controlled fallback is allowed only when there is no defensible exact leaf mapping:
  - a broader ancestor path may temporarily stand in for a missing exact leaf path
  - but fallback counts as debt, not full coverage
- Macropaedia is excluded from this exact-leaf requirement because it uses different source data.

## Important Current State

- The mapping script now supports:
  - exact leaf coverage reports
  - controlled fallback accounting
  - `gap-fill` planning
  - `repair-queue` planning
  - `status` reports that combine summary, validation, and coverage state
  - coverage thresholds such as `--fail-on-unresolved`
- Generated audit outputs are written under `scripts/output/` when status, coverage, gap-fill, or repair-queue is run.
- Those JSON files are generated artifacts and do not need to be checked into the repo.
- Do not assume VSI summaries are incomplete. Check first with `--mode status` or by inspecting the catalogs.

## Hard Instructions

1. Read these files before taking action:
   - `scripts/generate-summary-ai.mjs`
   - `scripts/generate-mappings-ai.mjs`
2. Obey the "IMPORTANT FOR CLAUDE CODE AGENTS" comments in both files.
3. If you use subagents:
   - use the exact system prompts defined in those scripts
   - use the exact validation rules defined in those scripts
   - use the batching/workflow described in `scripts/generate-mappings-ai.mjs`
   - especially: do not make up your own unrepeatable subagent prompts
4. Prefer using the existing scripts and their outputs over inventing new pipeline logic.
5. Keep changes minimal and repeatable.
6. Do not overwrite unrelated user changes.
7. Do not delete existing data unless explicitly required.
8. Validate after each meaningful step.
9. Do not run everything at once. Work in batches and come back to check in before continuing so we do not burn through the full token allocation.

## Your Immediate Objective

1. Establish the current pipeline state with `status`.
2. If any summaries are missing, resume summary generation and validate it.
3. Re-run exact leaf coverage audit.
4. Generate a gap-fill plan and repair queue for the chosen source type.
5. Use those plans to drive targeted, script-consistent remap/assign work in batches.

## Suggested Workflow

1. Run `status` first to inspect summary completeness, validation debt, and exact/fallback/unresolved coverage.
2. If summaries are incomplete for the target type, run the resumable summary pipeline.
3. Run summary validation.
4. Run mapping validation and exact leaf coverage audit.
5. Run gap-fill planning.
6. Run repair-queue planning.
7. Only then begin targeted remap/assign work for unresolved and fallback-only leaf paths.
8. Stop after each batch and report back before continuing to the next batch.

## Commands You Should Likely Use

- `node scripts/generate-mappings-ai.mjs --mode status --type vsi`
- `node scripts/generate-mappings-ai.mjs --mode status --type wikipedia`
- `node scripts/generate-summary-ai.mjs --type vsi`
- `node scripts/generate-summary-ai.mjs --validate`
- `node scripts/generate-mappings-ai.mjs --coverage`
- `node scripts/generate-mappings-ai.mjs --mode gap-fill --type vsi`
- `node scripts/generate-mappings-ai.mjs --mode repair-queue --type vsi`
- `node scripts/generate-mappings-ai.mjs --mode repair-queue --type wikipedia`
- `node scripts/generate-mappings-ai.mjs --validate`

## What To Report Back

- current summary count for the target type before and after
- exact leaf coverage for the target type before and after
- number of fallback-only and unresolved leaves for the target type
- repair-queue recommendation summary (`remap` vs `assign`)
- any blocking issues
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
