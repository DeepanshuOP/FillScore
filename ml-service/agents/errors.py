"""Typed error codes for the Agent Council.

Exception text can carry connection strings, credentials, or provider internals, so it never
reaches the browser. Callers classify the exception, log only the class name server-side,
and send the code plus one of the fixed messages below.
"""
from __future__ import annotations

from pymongo.errors import PyMongoError

RATE_LIMIT_EXHAUSTED = "RATE_LIMIT_EXHAUSTED"
DB_UNAVAILABLE = "DB_UNAVAILABLE"
NO_DATA = "NO_DATA"
MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
INTERNAL = "INTERNAL"
DAILY_BUDGET_EXHAUSTED = "DAILY_BUDGET_EXHAUSTED"
ASK_NOT_AVAILABLE_FOR_DEMO = "ASK_NOT_AVAILABLE_FOR_DEMO"
DEMO_NOT_GENERATED = "DEMO_NOT_GENERATED"

_MESSAGES = {
    RATE_LIMIT_EXHAUSTED: "The Council is at capacity right now. Please try again in a few minutes.",
    DB_UNAVAILABLE: "The Council can't reach its data right now. Please try again shortly.",
    NO_DATA: "There are no scored trades to analyse for this account yet.",
    MODEL_UNAVAILABLE: "The Council's AI model is unavailable right now. This is a configuration problem on our side, not yours.",
    INTERNAL: "The Council hit an unexpected problem. Please try again.",
    DAILY_BUDGET_EXHAUSTED: "The daily AI budget has been reached. Please try again tomorrow.",
    DEMO_NOT_GENERATED: "Demo analysis not yet generated for the current demo data.",
    ASK_NOT_AVAILABLE_FOR_DEMO: "Questions are not available on demo accounts: demo data is read-only and no model is run for it.",
}

_RATE_LIMIT_MARKERS = ("429", "too many requests", "rate limit", "rate_limit", "max retries exceeded")
_DB_MARKERS = ("bad auth", "atlaserror", "serverselectiontimeout", "authentication failed")


class CouncilError(Exception):
    """Raised when the council already knows which typed code applies."""

    def __init__(self, code: str, retry_after_s: int | None = None, quick_available: bool | None = None):
        super().__init__(code)
        self.code = code
        self.retry_after_s = retry_after_s
        # Set when a Deep audit was refused for budget: whether a Quick audit (1 unit instead of 9) is still allowed.
        self.quick_available = quick_available


def refusal_message(code: str, quick_available: bool | None = None) -> str:
    """The user-facing text of a refusal. For a Deep audit refused for budget it says plainly whether the Quick audit
    (one model call, 1 unit instead of 9) is still allowed."""
    base = safe_message(code)
    if quick_available is True:
        return base + " A Quick audit (one model call) is still available."
    if quick_available is False:
        return base + " A Quick audit is not available either."
    return base


def classify_exception(exc: BaseException) -> str:
    if isinstance(exc, CouncilError):
        return exc.code
    if isinstance(exc, PyMongoError):
        return DB_UNAVAILABLE
    if type(exc).__name__ == "RouterExhausted":
        return DAILY_BUDGET_EXHAUSTED if getattr(exc, "reason", "") == "budget" else MODEL_UNAVAILABLE

    if type(exc).__name__ == "NotFoundError":
        return MODEL_UNAVAILABLE

    text = str(exc).lower()
    if any(marker in text for marker in _RATE_LIMIT_MARKERS):
        return RATE_LIMIT_EXHAUSTED
    if any(marker in text for marker in _DB_MARKERS):
        return DB_UNAVAILABLE
    return INTERNAL


def safe_message(code: str) -> str:
    return _MESSAGES.get(code, _MESSAGES[INTERNAL])
