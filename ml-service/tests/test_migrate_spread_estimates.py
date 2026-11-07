"""4R-0 Task 2: move the 4a dict out of spreadBps into spreadEstimates. Offline (mongomock); dry-run by default."""
import copy

import mongomock

from scripts.migrate_spread_estimates import migrate

DICT = {"cs": 3.05, "ar": 2.71, "n_pairs": 60}


def _col():
    col = mongomock.MongoClient()["fillscore"]["trades"]
    col.insert_many([
        {"_id": "r1", "userId": "u1", "spreadBps": dict(DICT), "halfSpreadBps": 1.355, "fillScore": 77.5},
        {"_id": "r2", "userId": "u1", "spreadBps": 1.2, "fillScore": 80.0},               # numeric: leave alone
        {"_id": "r3", "userId": "u1", "fillScore": 70.0},                                  # no spreadBps at all
        {"_id": "d1", "userId": "demo-moderate", "spreadBps": dict(DICT), "fillScore": 90.0},
    ])
    return col


def test_moves_dict_to_spreadEstimates():
    col = _col()
    rep = migrate(col, apply=True)
    r1 = col.find_one({"_id": "r1"})
    # {cs, ar, n_pairs} -> {cs, ar, n_pairs, version: 1}; spreadBps removed
    assert r1["spreadEstimates"] == {"cs": 3.05, "ar": 2.71, "n_pairs": 60, "version": 1}
    assert r1["spreadBps"] is None                                             # nulled, never $unset (4R-0b decision 1)
    assert r1["halfSpreadBps"] == 1.355 and r1["fillScore"] == 77.5          # nothing else touched
    assert rep["to_move"] == 1 and rep["considered"] == 3                      # demo excluded by default


def test_idempotent_second_run_noop():
    col = _col()
    migrate(col, apply=True)
    snap = list(col.find({}))
    rep = migrate(col, apply=True)
    assert list(col.find({})) == snap
    assert rep["to_move"] == 0 and rep["already_moved"] == 1


def test_dry_run_writes_nothing():
    col = _col()
    before = copy.deepcopy(list(col.find({})))
    rep = migrate(col, apply=False)
    assert list(col.find({})) == before
    assert rep["to_move"] == 1 and rep["apply"] is False


def test_numeric_spreadBps_untouched():
    col = _col()
    migrate(col, apply=True)
    r2 = col.find_one({"_id": "r2"})
    assert r2["spreadBps"] == 1.2 and "spreadEstimates" not in r2


def test_demo_rows_need_include_demo_and_restore_is_reported_blocked():
    col = _col()
    migrate(col, apply=True)
    assert isinstance(col.find_one({"_id": "d1"})["spreadBps"], dict)         # untouched without the flag
    rep = migrate(col, apply=True, include_demo=True)
    assert rep["to_move"] == 1
    d1 = col.find_one({"_id": "d1"})
    assert d1["spreadBps"] is None and d1["spreadEstimates"]["version"] == 1  # never an invented numeric value
    assert rep["restore"]["status"] == "blocked"


def test_conflict_not_overwritten():
    col = mongomock.MongoClient()["fillscore"]["trades"]
    existing = {"cs": 9.0, "ar": 8.0, "n_pairs": 5, "version": 1}
    col.insert_one({"_id": "c1", "userId": "u1", "spreadBps": dict(DICT), "spreadEstimates": dict(existing)})
    rep = migrate(col, apply=True)
    c1 = col.find_one({"_id": "c1"})
    assert c1["spreadEstimates"] == existing and c1["spreadBps"] == DICT      # skipped entirely
    assert rep["conflicts"] == 1 and rep["to_move"] == 0 and rep["set_null_spreadBps"] == 0


def test_sets_null_not_unset():
    col = _col()
    migrate(col, apply=True)
    r1 = col.find_one({"_id": "r1"})
    assert "spreadBps" in r1 and r1["spreadBps"] is None


def test_dry_run_counts_real_and_warns():
    col = _col()
    rep = migrate(col, apply=False, include_demo=True)
    # r1 real dict + d1 demo dict -> 2 would be nulled: 1 real, 1 demo
    assert rep["set_null_spreadBps"] == 2
    assert rep["by_account_type"] == {"demo": 1, "real": 1}
    assert rep["conflicts"] == 0
    assert rep["warnings"] == ["WARNING: 1 real-user trades would lose numeric spreadBps and be skipped on re-audit"]
    rep2 = migrate(_col(), apply=False)           # demo excluded, still 1 real
    assert rep2["by_account_type"] == {"demo": 0, "real": 1}
    col3 = mongomock.MongoClient()["f"]["t"]
    col3.insert_one({"_id": "x", "userId": "demo-a", "spreadBps": dict(DICT)})
    assert migrate(col3, include_demo=True)["warnings"] == []                  # real == 0 -> no warning


def test_assert_writable_called_in_dry_run(monkeypatch):
    import scripts.migrate_spread_estimates as m
    calls = []
    monkeypatch.setattr(m, "assert_writable", lambda coll, field, value, writer: calls.append((coll, field, value, writer)))
    col = _col()
    before = list(col.find({}))
    m.migrate(col, apply=False)
    assert list(col.find({})) == before
    w = "ml-service/scripts/migrate_spread_estimates.py"
    assert ("Trade", "spreadBps", None, w) in calls
    assert any(c[1] == "spreadEstimates" and c[3] == w for c in calls)


def test_batches_cursor():
    col = mongomock.MongoClient()["fillscore"]["trades"]
    col.insert_many([{"_id": i, "userId": "u1", "spreadBps": dict(DICT)} for i in range(1201)])
    rep = migrate(col, apply=True)
    # 1201 docs / 500 per batch = 500 + 500 + 201 -> 3 batches
    assert rep["batches"] == 3 and rep["to_move"] == 1201
    assert col.count_documents({"spreadBps": None}) == 1201


def test_abbreviated_apply_rejected():
    import pytest
    from scripts.migrate_spread_estimates import main
    with pytest.raises(SystemExit) as e:
        main(["--ap"])
    assert e.value.code == 2
