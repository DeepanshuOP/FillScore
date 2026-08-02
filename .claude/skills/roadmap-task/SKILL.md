---
name: roadmap-task
description: Execute exactly one FillScore roadmap item (an R5-* or R6-* ID) end to end with TDD, verification before completion, and a stop-and-report gate. Use whenever Deepanshu names a roadmap ID or asks to implement a numbered task.
---

# Execute one roadmap task

You are given a single roadmap ID, e.g. `R6-B1` or `R5-C7`. Do that one task and nothing else.

## 1. Ground yourself before writing anything

- Read the item's entry in `ROADMAP.md` at the repo root. **Read only the relevant section** — it is a
  1000-line reference document, not a file to load whole. Find the section by ID: `§3` blocking layer
  (R6-B0.x) · `§4.1` built features · `§4.2` deferred infra (T2.7, T2.9–T2.14) · `§4.3` Phase 3 ML
  (T3.x) · `§4.4` Agent Council (AC-x) · `§4.5` Phase 4 SaaS (T4.x, full DoDs) · `§4.6` must-fix
  (R5-M*) · `§4.7` half-built (R5-C*) · `§4.8` gap closure (R6-G*) · `§4.9` new capabilities
  (R6-A/B/C/D) · `§4.10` growth (T5.x, T6.1) · `§5` research (R6-E*).
- Many entries say "full spec at **T4.x**" — follow that pointer within `ROADMAP.md`. Everything is
  inlined in that one file; **there is no archive and no other roadmap**. If a spec seems missing,
  that is a bug in `ROADMAP.md` — say so and stop. Never substitute an older document.
- Also read `§2` (current state and corrections) and `§9` (verification discipline) before starting.
- `ARCHITECTURE.md` is stale (it predates Phase 4). Do not trust it for build status until R6-D10.
- Read the actual files the item names. **Do not assume something exists or doesn't** — grep for it.
  Several prior sessions were lost to building against a stale assumption.
- If the item's stated dependencies are not actually built, stop and say so. Do not build the
  dependency as a bonus.

## 2. Restate before building

Output, before any code:
- One sentence: what this task delivers.
- The exact files you will touch, and for each, create-vs-edit.
- The acceptance criterion, restated in the form of the test that will prove it.
- Anything in the roadmap spec that you believe is wrong or stale, with evidence.

If any of that is ambiguous, ask. One question, then stop.

## 3. Red phase

Write the test first, with **hand-computed fixture values**. Show the computation in a comment so the
number is auditable. Run it. **Show the actual failing output.** A test that passes before the
implementation exists is not a test.

Fixture values are ground truth. If the test fails after implementation, the code is wrong. Never
adjust a fixture to make a test pass. Never assert against a mock when the point is to verify real
derivation logic — `expect(status).toBeGreaterThanOrEqual(400)` accepts a 500 and is worthless.

## 4. Green phase

Implement. Surgical edits on existing files; full content on new files. PowerShell syntax in every
command. Run the test again and show the passing output.

## 5. Verify before claiming completion

Run the full relevant suite, plus — for anything touching the frontend — `npx tsc --noEmit` and
`npm run build`. Both have caught real production bugs the test suites structurally could not.

Then deliberately break the implementation in one small way and confirm the new test fails. If it
still passes, the test does not discriminate and is not finished.

## 6. Report

State plainly:
- What passed, with the raw counts.
- What you changed, as a diff.
- Anything you noticed that is broken but out of scope, listed but NOT fixed.
- Whether the acceptance criterion is met — and if it is only partly met, say so. A partial result
  reported honestly is worth more than a complete-sounding summary.

**Do not commit.** Print the file list you would stage and a one-line plain commit message, then wait
for explicit authorization.

## Stop-and-report triggers

Stop immediately and report instead of proceeding if: a test fails for a reason you did not predict;
the roadmap spec contradicts the code; a fix would require touching a file outside the stated list; or
a change would alter any locked demo grade, any scoring constant, or anything under `whale/`.
