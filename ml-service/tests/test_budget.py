"""Run budget that protects the free-tier Groq allowance (a mid-run 429 silently degrades a run)."""
from config.budget import RunBudget


class Clock:
    def __init__(self, now=1_700_000_000.0):
        self.now = now

    def __call__(self):
        return self.now


def make(**kw):
    clock = Clock()
    budget = RunBudget(clock=clock, **kw)
    return budget, clock


def test_allows_runs_up_to_the_per_account_limit_then_blocks():
    budget, _ = make(per_account_limit=2, per_account_window_s=3600, daily_limit=100)
    assert budget.try_acquire("a").allowed
    assert budget.try_acquire("a").allowed
    third = budget.try_acquire("a")
    assert not third.allowed
    assert third.reason == "account"
    assert third.retry_after_s > 0


def test_accounts_do_not_share_their_per_account_allowance():
    budget, _ = make(per_account_limit=1, per_account_window_s=3600, daily_limit=100)
    assert budget.try_acquire("a").allowed
    assert budget.try_acquire("b").allowed
    assert not budget.try_acquire("a").allowed


def test_per_account_window_slides():
    budget, clock = make(per_account_limit=1, per_account_window_s=3600, daily_limit=100)
    assert budget.try_acquire("a").allowed
    clock.now += 3599
    assert not budget.try_acquire("a").allowed
    clock.now += 2
    assert budget.try_acquire("a").allowed


def test_daily_cap_is_global_across_accounts():
    budget, _ = make(per_account_limit=10, per_account_window_s=3600, daily_limit=3)
    assert budget.try_acquire("a").allowed
    assert budget.try_acquire("b").allowed
    assert budget.try_acquire("c").allowed
    blocked = budget.try_acquire("d")
    assert not blocked.allowed
    assert blocked.reason == "daily"


def test_daily_cap_resets_at_utc_midnight():
    # 2023-11-14 23:59:00 UTC
    budget, clock = make(per_account_limit=10, per_account_window_s=3600, daily_limit=1)
    clock.now = 1_700_006_340.0
    assert budget.try_acquire("a").allowed
    assert not budget.try_acquire("b").allowed
    clock.now += 120  # now past midnight UTC
    assert budget.try_acquire("b").allowed


# M3 §4: a Deep audit (9 calls) costs 9 units, a Quick audit (1 call) costs 1. The limits stay in Deep runs, so the
# per-hour and per-day Deep allowances are unchanged: 3 Deep per hour per account = 27 units, 8 Deep per day = 72 units.
def test_a_quick_audit_costs_one_ninth_of_a_deep_one():
    from config.budget import DEEP_UNITS, QUICK_UNITS
    assert (DEEP_UNITS, QUICK_UNITS) == (9, 1)
    budget, _ = make(per_account_limit=1, per_account_window_s=3600, daily_limit=100)      # 1 Deep run = 9 units per hour
    for _i in range(9):
        assert budget.try_acquire("a", QUICK_UNITS).allowed                                  # 9 Quick = 1 Deep
    blocked = budget.try_acquire("a", QUICK_UNITS)
    assert not blocked.allowed and blocked.reason == "account"


def test_quick_and_deep_draw_on_the_same_allowance():
    from config.budget import DEEP_UNITS, QUICK_UNITS
    budget, _ = make(per_account_limit=2, per_account_window_s=3600, daily_limit=100)       # 18 units per hour
    assert budget.try_acquire("a", DEEP_UNITS).allowed                                       # 9 used
    for _i in range(9):
        assert budget.try_acquire("a", QUICK_UNITS).allowed                                  # 18 used
    assert not budget.try_acquire("a", QUICK_UNITS).allowed
    assert not budget.try_acquire("a", DEEP_UNITS).allowed


def test_a_deep_run_is_refused_when_only_quick_room_is_left_and_status_says_so():
    from config.budget import DEEP_UNITS, QUICK_UNITS
    budget, _ = make(per_account_limit=100, per_account_window_s=3600, daily_limit=1)       # 9 units per day
    for _i in range(5):
        assert budget.try_acquire("a", QUICK_UNITS).allowed                                  # 5 used, 4 left
    assert not budget.try_acquire("b", DEEP_UNITS).allowed                                   # needs 9, 4 left
    s = budget.status("b")
    assert s["deepAvailable"] is False and s["quickAvailable"] is True
    assert s["day"] == {"unitsLeft": 4, "deepLeft": 0, "quickLeft": 4}
    assert budget.try_acquire("b", QUICK_UNITS).allowed                                      # Quick still works


def test_status_with_a_disabled_limit_has_no_cap_for_it():
    budget, _ = make(per_account_limit=0, per_account_window_s=3600, daily_limit=0)
    s = budget.status("a")
    assert s["deepAvailable"] is True and s["quickAvailable"] is True
    assert s["day"] is None and s["account"] is None


def test_status_per_account_counts_only_the_window():
    from config.budget import DEEP_UNITS
    budget, clock = make(per_account_limit=2, per_account_window_s=3600, daily_limit=100)
    budget.try_acquire("a", DEEP_UNITS)
    s = budget.status("a")
    assert s["account"] == {"unitsLeft": 9, "deepLeft": 1, "quickLeft": 9, "retryAfterS": 0}
    clock.now += 3601
    assert budget.status("a")["account"]["unitsLeft"] == 18


def test_a_blocked_attempt_does_not_use_up_budget():
    budget, _ = make(per_account_limit=1, per_account_window_s=3600, daily_limit=2)
    assert budget.try_acquire("a").allowed
    for _ in range(5):
        assert not budget.try_acquire("a").allowed
    assert budget.try_acquire("b").allowed  # the daily allowance was not eaten by the refusals


def test_zero_disables_a_limit():
    budget, _ = make(per_account_limit=0, per_account_window_s=3600, daily_limit=0)
    for _ in range(50):
        assert budget.try_acquire("a").allowed


def test_limits_come_from_the_environment_at_call_time(monkeypatch):
    budget = RunBudget(clock=Clock())
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "1")
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "5")
    assert budget.try_acquire("a").allowed
    assert not budget.try_acquire("b").allowed
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "10")
    assert budget.try_acquire("b").allowed


def test_defaults_match_the_free_tier_arithmetic(monkeypatch):
    monkeypatch.delenv("COUNCIL_DAILY_RUN_CAP", raising=False)
    monkeypatch.delenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", raising=False)
    budget = RunBudget(clock=Clock())
    # 100K tokens/day on the 70B model divided by ~11.6K per run is 8 runs
    allowed = sum(1 for i in range(20) if budget.try_acquire(f"acct-{i}").allowed)
    assert allowed == 8
