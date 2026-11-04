---
name: run-brief
description: Orchestrator protocol for executing a FillScore phase brief in .work/ with implementer, test-runner, reviewer and Explore subagents. Use whenever asked to run, follow or execute a BRIEF_*.md file.
---

# Running a FillScore brief as orchestrator

You are the orchestrator. You plan, write specs, compute expected values, verify evidence and write the report. Workers do the typing and the test running. Your context is the scarce resource, so keep verbose output out of it.

## 1. Set up
- Read the brief and CLAUDE.md. For wide reading ("where is X used", "how does Y work"), delegate to `Explore` and read only its summary plus the specific lines you need.
- Create the brief's checklist file in `.work/` and keep it current. A progress note is not the end of the task: continue until every item is DONE or BLOCKED.

## 2. For each checklist item, decide who does it
- **Do it yourself:** design decisions, cross-cutting interfaces, computing hand-checked expected values, tiny edits (a few lines), and anything where writing the spec would take longer than the change.
- **Delegate to `implementer`** (Sonnet): any self-contained code change. Send a spec packet containing:
  1. Goal (one sentence)
  2. Files to touch, and files not to touch
  3. Exact behaviour, including edge cases
  4. Hand-computed fixtures with the arithmetic shown. You compute these; this is where Opus earns its cost.
  5. The test command(s) to run
  6. Constraints from the brief's hard rules that apply
  7. The report format (the implementer's standard report)
- **Parallelism:** run implementers in parallel only for items that touch disjoint files. Never put two workers on the same file. Use `isolation: worktree` only when asked.
- **Escalation:** if an implementer fails the same item twice, either do it yourself or re-delegate with `model: opus` passed on the Agent call. Record the escalation.

## 3. Verify every delegated item before marking it DONE
- Read the actual diff for the touched files (`git diff -- <files>`), not just the worker's report.
- Check the red/green evidence and that the test asserts the hand-computed values.
- Have `test-runner` run the touched tier's tests and typecheck.
- If something is wrong, send precise feedback to the **same** implementer (SendMessage to its id or name) so it keeps its context. Allow one re-send, then escalate.

## 4. Close the phase
- `reviewer` on the full diff (`git diff` plus untracked files) with the brief's requirements. Fix correctness, requirement, integrity and security findings; note the rest.
- `test-runner` runs all three tiers' full suites. The final summary lines go in the report.
- Write the report the brief asks for, including an orchestration log: each item, who did it (self, or which agent and model), re-sends, escalations, and token totals per agent from the transcripts if available.
- Print what the brief's final turn requires, then stop.

## 5. Hygiene
- Never paste full test logs or whole files into your own context; ask for summaries.
- Never work around a guard, hook or permission denial, and never let a worker do so. Record it as BLOCKED.
- If context gets large between items, compact at an item boundary. CLAUDE.md lists what to preserve.
