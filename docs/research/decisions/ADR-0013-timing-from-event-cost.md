# ADR-0013: Scoring v2.2.0 scores timing by the excess cost of the hour, not by its rank

- **Status:** accepted (method fixed 2026-11-13 before any v2.2.0 grade was computed; results appended below)
- **Date:** 2026-11-13
- **Phase:** M2 closing steps, before the demo grades are re-locked
- **Decided by:** Deepanshu (Waiting item 7, 2026-11-13)

## Context
- v2.1.0 builds the hour profile from the median quoted half-spread plus the median absolute 1-minute move, and scores a fill by the rank of its UTC hour among 24 hours (`100 x (1 - cheaper hours / 23)`).
- On the rebuilt demos this reversed the profiles' order (`docs/research/LOG.md` §L): the disciplined profile trades 08:00-15:00 UTC, which holds the three most volatile hours. The 1-minute move is about 1,000 times the half-spread on BTCUSDT, so the profile read volatility, not the cost of trading.
- A rank over 24 hours has a second flaw. On one-tick markets, where almost every taker event pays half a tick, the hourly costs are nearly identical, and a rank turns noise into a 0-100 spread.

## Decision (the method, fixed before computing any grade)
1. **Hour profile = cost.** For each UTC hour, the median effective half-spread (bps) of public taker events that started in that hour, pooled over the 90 calibration days (the taker-event unit of ADR-0012). The hour of an event is the hour of its first print. The profile needs events on at least 30 days in every hour, as before.
2. **Reference = the mean of the symbol's 3 cheapest hourly medians.** Excess cost of an hour = its median minus the reference, never below 0 (bps).
3. **Materiality floor = one price step.** An excess at or below `floor` scores 100. The floor is `tick / typical mid x 1e4` in bps (median over the calibration days of the day's median event mid), times `timingFloorSteps = 1.0`. Reason: a price cannot move by less than one step, so a cost difference below one step is not a difference an order could have avoided. The data check is reported below.
4. **Points above the floor.** The excess above the floor is converted to points on the spread ladder of the fill's size class: the market-median event (anchor a50, 75 points) is re-scored at `a50 + (excess - floor)` and the result is divided by 75 and multiplied by 100. So 100 = no material excess, and 0 = the median event would have scored 0. This reuses the anchors the spread component already uses, so no new scale is introduced. If the size class has no valid anchors, an excess above the floor reads "insufficient data".
5. **No tuning.** The grades the method gives are accepted. The sensitivity table (reference = cheapest hour / 3 hours / 6 hours; floor = 0.5 / 1 / 2 steps) is published to show how much the grades depend on these choices, not to choose among them.
6. `v2.1.0` and `v2.0.0` stay reproducible: `timingUnit: "excess_event_cost"` in the version file switches the new rule on; a version without it ranks hours.

## Alternatives considered
- **Rank by percentile over 24 hours on the cost profile.** Rejected (Deepanshu): on one-tick markets near-identical costs would become a 0-100 spread.
- **Keep volatility in the profile (v2.1.0).** Rejected: it reverses the profiles and measures volatility.
- **Lower the timing weight.** Not chosen; the weight (0.25) is part of the approved design (spec D5).

## Results (appended 2026-11-13; numbers and commands in `docs/research/LOG.md` §N)
- **Floor, checked against data.** On all four symbols the dearest hour costs less than one price step more than the cheapest hours (BTCUSDT range 0.00001 bps against a step of 0.00125; ETHUSDT 0.031 against 0.041; BNBUSDT 0.002 against 0.138; SOLUSDT 0.025 against 0.972), and the between-day noise of an hourly median is as large as the range or larger. So no hour passes the floor, and the timing score is 100 for every fill.
- **Grades accepted as they came out:** demo-aggressive 90.28 A, demo-moderate 90.48 A, demo-disciplined 90.06 A (v2.1.0: 78.26 B, 76.36 B, 73.06 C). All three bands overlap.
- **Sensitivity (12 variants of reference hours x floor):** no variant changes a letter or the order. Without any floor timing is 99.8-99.9 and composites move by at most 0.06.
- **Consequence to decide later, not now:** timing carries 25% of the weight and is constant, so it raises every grade and separates no one. A lower weight, or dropping the component, would be a new scoring version.

## Consequences
- Summary storage format 2 keeps a deterministic stride sample of at most 4,000 event costs per day and hour (the median of the pooled samples), with the true event counts. The 90 days were re-streamed from the raw files; the spread and slippage anchors of v2.2.0 must equal those of v2.1.0 (same code, same data), which the results section checks.
- The method page (`/methodology`) describes the new timing rule from the code.
