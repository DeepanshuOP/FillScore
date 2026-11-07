# ADR-0009: Store 4a spread estimates in their own field; `spreadBps` stays the scorer's number

- **Status:** proposed
- **Date:** 2026-11-07
- **Phase:** audit 2026-11 → 4b-1 (blocker)

## Context
- **What was written:** the 4a backfill writes `spreadBps` (`ml-service/scripts/backfill_markouts.py:4`; asserted in `ml-service/tests/test_backfill_markouts.py:93`) as an object that the renderer reads as `t["spreadBps"]["cs"]` / `["ar"]` (`ml-service/agents/render.py:226-227`).
- **What the scorer expects:** `spreadBps` is a Number in the Trade model (`backend/src/models/Trade.ts:38`) and is read as a number by the scorer (`backend/src/scoring/engine.ts:234, 243`), attribution (`scoring/attribution.ts:123-136`) and CSV export (`routes/audit.ts:406`).
- **Atlas, 2026-11-07:** the audit's aggregate query Q1 crashed on demo `spreadBps` values with `TypeError: '<' not supported between instances of 'dict' and 'dict'`, and field presence is 100% on every demo account. An exact per-type count was withdrawn because it came from a query run after a guard block (see `docs/research/AUDIT_2026-11.md`, "Evidence withdrawn").
- **Effects:**
  - `scoreExchange` throws for every trade, so a demo re-audit would fail with `no_trades_found`;
  - spread cost renders $0;
  - the CSV prints `[object Object]`.
- **Why tests missed it:** `test_backfill_markouts.py:93` treated `spreadBps` as a new field, and the grade-invariance test pins constants only.

## Decision (proposed)
- Write the estimates to a new field (e.g. `spreadEstimates: {cs, ar, nPairs}`).
- Never write to an existing field from an enrichment script; assert this in a test.
- Restore the demo `spreadBps` values only with explicit written permission. This is an Atlas write against locked data.
- Add a backend test that runs `scoreTrade` on a document shaped like a backfilled one.

## Alternatives considered
- **Make the scorer accept both shapes:** hides the collision and keeps the ambiguity.

## Consequences
- The 4a render path (`ml-service/agents/render.py:226-227`) must read the new field.
- Golden packets need regenerating after the rename.
