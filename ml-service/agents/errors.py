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
INTERNAL = "INTERNAL"

_MESSAGES = {
    RATE_LIMIT_EXHAUSTED: "The Council is at capacity right now. Please try again in a few minutes.",
    DB_UNAVAILABLE: "The Council can't reach its data right now. Please try again shortly.",
    NO_DATA: "There are no scored trades to analyse for this account yet.",
    INTERNAL: "The Council hit an unexpected problem. Please try again.",
}

_RATE_LIMIT_MARKERS = ("429", "too many requests", "rate limit", "rate_limit", "max retries exceeded")
_DB_MARKERS = ("bad auth", "atlaserror", "serverselectiontimeout", "authentication failed")


class CouncilError(Exception):
    """Raised when the council already knows which typed code applies."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def classify_exception(exc: BaseException) -> str:
    if isinstance(exc, CouncilError):
        return exc.code
    if isinstance(exc, PyMongoError):
        return DB_UNAVAILABLE

    text = str(exc).lower()
    if any(marker in text for marker in _RATE_LIMIT_MARKERS):
        return RATE_LIMIT_EXHAUSTED
    if any(marker in text for marker in _DB_MARKERS):
        return DB_UNAVAILABLE
    return INTERNAL


def safe_message(code: str) -> str:
    return _MESSAGES.get(code, _MESSAGES[INTERNAL])
