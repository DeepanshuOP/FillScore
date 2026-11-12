# ADR-0012: The spread baseline is measured on taker events; Scoring v2.1.0 is calibrated on 90 days

- **Status:** accepted
- **Date:** 2026-11-12
- **Phase:** M1.1 (architect review of M1), before M2 re-locks the demo grades on v2

## Context
- The v2.0.0 calibration (ADR-0010) put the median effective half-spread of BTCUSDT taker prints under 1k USD at 0.20 bps. Half a tick on BTCUSDT (tick 0.01 at about 110k USD) is about 0.00045 bps, about 400 times smaller, and the single real-fill check of M1 measured exactly half a tick.
- The review suspected two biases: (a) stale quote proxies (each side may be up to 5 s old); (b) one taker order that walks several price levels prints one aggTrade per level in the same millisecond, and each level was measured and size-bucketed as a separate small taker.
- Five calibration days per symbol gave each hour of the hour profile only five days of data.

## Evidence (`ml-service/scripts/spread_bias_report.py`, the 20 v2.0.0 calibration files; `docs/research/LOG.md` §K)
- **Bias (b) explains the gap.** BTCUSDT prints under 1k USD: median 0.204 bps overall; 0.00045 bps (half a tick) for the first print of a same-millisecond same-side run; 0.382 bps for the later prints, which are 64% of all prints. ETH 66%, BNB 41%, SOL 20% of small prints are later prints of a run.
- **Grouped into taker events** (consecutive prints with the same millisecond and aggressor side; VWAP against the mid strictly before that millisecond; bucketed by the event's notional), the BTC lt1k median is 0.00045 bps, half a tick, at every quote age.
- **Bias (a) is second-order once events are used.** Moving the age cap from 5000 ms to 1000 ms changes the event median by less than 0.012 bps in 13 of 16 symbol × bucket cells; the exceptions are large-notional buckets (BNB ge100k 1.319 → 1.188, SOL 10k-100k 0.448 → 0.460, SOL ge100k 0.901 → 0.886 bps), where fresher quotes coincide with fast markets and the median moves in no consistent direction. Tighter caps remove most events: two-sided coverage is 97-98% at 5000 ms, 60-76% at 1000 ms, 23-37% at 250 ms, 5-15% at 50 ms. The one consistent effect of old quotes is in the tail: for ETH and BNB events under 1k USD the 90th percentile is 0.887 / 0.866 bps at 5000 ms and 0.789 / 0.735 bps at 1000 ms.
- **Population note (review M1.1, low 4).** The report counts an event only when it has a two-sided quote (both proxies within the cap, ask ≥ bid). The calibration also keeps events measured against the last trade when the quote is not two-sided (the same fallback user fills get). So the medians and coverage above describe the two-sided subset, which is 97-98% of events at the 5000 ms cap; the anchors in the version file come from the full population.
- **Millisecond vs microsecond grouping.** The 2025 files carry microsecond times. Grouping by the exact microsecond gives 9-29% more events under 1k USD (two same-side orders in one millisecond are split); the BTC and SOL lt1k medians are unchanged, the ETH and BNB lt1k medians are 0.026 and 0.034 bps higher.

## Decision
1. **Spread baseline on taker events** (`scoring_v2.calibrate.taker_events`), grouped by millisecond and side. Milliseconds, not microseconds, because a user's fill carries only a millisecond time, and the user's own measurement already excludes every print in that millisecond: the baseline must be built the same way.
2. **The user side is scored in the same unit.** Since v2.1.0 (`"spreadUnit": "taker_event"` in the version file) the fills of one order in one millisecond, with one side and one stored mid, form one event: its effective half-spread is the quantity-weighted mean of the fills' values (exactly the VWAP against the shared mid), bucketed by the event notional, and each fill carries the event's score. A version without `spreadUnit` (v2.0.0) still scores per fill, so v2.0.0 scores stay reproducible.
3. **Quote-age rule: keep 5000 ms, for both sides of the comparison.** A tighter cap removes 24-95% of events and keeps a biased subset (fast two-sided moments), while it moves medians by less than 0.012 bps in most cells. The same rule on the user's fill and on the baseline makes the comparison like-for-like, and both proxy ages are recorded on every fill (`quoteAgesMs`). The tail effect (90th percentile 12% higher for small ETH events and 18% higher for small BNB events than with a 1000 ms cap) is stated here and on the method page. Revisit with real user fills: if their quote ages differ from the public events', stratify the anchors by age.
4. **Calibration v2.1.0 over 90 days,** every day from 2026-08-12 to 2026-11-09 (the spec's "90 days before the version's release date"), for BTCUSDT, ETHUSDT, BNBUSDT and SOLUSDT: 360 checksum-verified files. Streaming: each day is reduced to a summary (`day_summary`), the raw zip is deleted, and the anchors come from the merged summaries. Sample counts per anchor are stored in the version file (`calibrationCounts`).
5. **Hour profiles need at least 30 days with samples in every hour** (`MIN_PROFILE_DAYS`); otherwise the profile is None and timing reads "insufficient data".
6. Measurement is unchanged (`MEASURE_VERSION` stays 1.0.0): stored fill measurements remain valid. `scoring_v2/score.py` joins the code hash, because it now forms the spread units.

## Alternatives considered
- **A tight quote-age cap (50-250 ms).** Rejected: coverage falls to 5-37%, the kept events are a selected subset, and the remaining user fills would mostly be "not measured".
- **Only the first print of each run.** Rejected: it drops the cost of walking the book, which a large order really pays.
- **Microsecond grouping.** Rejected for the baseline: user fills cannot be grouped that way, so the two sides would not match.

## Consequences
- The v2.1.0 spread anchors are far lower and tighter than v2.0.0's for BTC (the bias is gone); a fill that walked several levels is no longer compared with the deeper levels of other people's orders.
- M2 grades the rebuilt demos under v2.1.0.
- v2.0.0 stays committed and pinned; nothing was ever scored on it in production.
