"""C5: canonical JSON and the integrity hash of a v2 result.

Anyone with the stored measurements, the committed ScoringVersion file and the market-data checksums can
recompute the hash:
  canonical JSON = json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False), UTF-8;
                   floats are written with repr (Python's shortest round-trip form)
  metricHash     = sha256(canonical JSON of one trade's stored measurement)
  integrity      = sha256(canonical JSON of {scoringVersion, versionFileSha256,
                                             trades: [{tradeId, metricHash}] sorted by tradeId,
                                             marketDataSha256: sorted unique checksums})
"""
from __future__ import annotations

import hashlib
import json
from typing import Iterable


def canonical_json(obj) -> str:
    try:
        return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except ValueError as e:
        raise ValueError(f"not canonicalisable: {e}") from None


def _sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def metric_hash(measurement: dict) -> str:
    return _sha(canonical_json(measurement))


def integrity_hash(scoring_version: str, version_file_sha256: str, trades: Iterable[tuple[str, dict]],
                   market_data_sha256: Iterable[str]) -> str:
    rows = sorted(({"tradeId": str(tid), "metricHash": metric_hash(m)} for tid, m in trades), key=lambda r: r["tradeId"])
    ids = [r["tradeId"] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate trade id in integrity input")
    return _sha(canonical_json({
        "scoringVersion": scoring_version,
        "versionFileSha256": version_file_sha256,
        "trades": rows,
        "marketDataSha256": sorted(set(market_data_sha256)),
    }))
