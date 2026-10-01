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
