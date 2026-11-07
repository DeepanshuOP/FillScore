"""4R-0b: argparse abbreviations are off, registry repair rule, backfill checks ownership in dry-run."""
import mongomock
import pytest

from marketdata.field_registry import FieldOwnershipError, assert_writable

MIG = "ml-service/scripts/migrate_spread_estimates.py"


def test_backfill_abbrev_apply_exits_2():
    from scripts.backfill_markouts import main
    with pytest.raises(SystemExit) as e:
        main(["--app"])
    assert e.value.code == 2


def test_repair_writer_may_only_null_spreadBps():
    assert_writable("Trade", "spreadBps", None, MIG)                  # allowed: repair, value None
    with pytest.raises(FieldOwnershipError):
        assert_writable("Trade", "spreadBps", 1.2, MIG)               # a number is not a repair
    with pytest.raises(FieldOwnershipError):
        assert_writable("Trade", "spreadBps", None, "ml-service/other.py")


def test_backfill_calls_assert_writable_in_dry_run(monkeypatch):
    import marketdata.field_registry as fr
    from marketdata.enrich import FIELDS, run_backfill
    seen = []
    monkeypatch.setattr(fr, "assert_writable", lambda c, f, v, w: seen.append(f))
    run_backfill(mongomock.MongoClient()["f"]["trades"], lambda s, d: None, apply=False)
    assert set(seen) == set(FIELDS)
