# ADR-0010: Scoring v2 versions and calibration tables are committed JSON files, not database documents

- **Status:** accepted
- **Date:** 2026-11-11
- **Phase:** M1 Part C

## Context
- Spec §5.1 (`docs/superpowers/specs/2026-11-07-measurement-v2-design.md`) put `ScoringVersion` in MongoDB.
- Invariant I4 says published grades never change silently. A version must be reproducible and reviewable.
- Writes to Atlas outside the test suite need Deepanshu's approval, and the demo dataset has been corrupted by scripts before.

## Decision
- Each version is a canonical JSON file `ml-service/scoring_v2/versions/<id>.json`, with sorted keys and no spaces. It holds the weights, bands, minimum sample, anchors per symbol, component and bucket, the hour profiles, the fee table with its source, the calibration window and day rule, the SHA-256 of every source file, the measurement version and a hash of the scoring code.
- A committed file is never edited. `tests/scoring_v2/test_version.py` pins each file's SHA-256, and a new calibration gets a new id.
- `config/versions.py` `SCORING_V2_VERSION` names the version in use. Every stored score names its version and that file's SHA-256, and its integrity hash covers both.
- v2.0.0 was calibrated on BTCUSDT, ETHUSDT, BNBUSDT and SOLUSDT, on every 7th day from 2025-10-01 to 2025-10-29, using 20 checksum-verified data.binance.vision daily files.

## Alternatives considered
- **A `scoring_versions` collection:** it needs an Atlas write to publish, a reviewer cannot see a diff, and it is not reproducible from git.

## Consequences
- Publishing a new version is a reviewed commit and a deploy.
- A symbol outside the calibrated set gets "insufficient data" for spread, slippage and timing; fees still score.
- Five days is a small calibration window. The window and its rule are stated in the file and on the methodology page; a wider window is a new version.
