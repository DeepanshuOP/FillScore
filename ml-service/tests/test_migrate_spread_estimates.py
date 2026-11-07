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
    assert "spreadBps" not in r1
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
    assert "spreadBps" not in d1 and d1["spreadEstimates"]["version"] == 1    # never an invented numeric value
    assert rep["restore"]["status"] == "blocked"
