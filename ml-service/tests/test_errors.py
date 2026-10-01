"""Typed, sanitized error codes for the council stream (R5-M9 / audit F2)."""
from pymongo.errors import ServerSelectionTimeoutError, OperationFailure

from agents.errors import classify_exception, safe_message, CouncilError


def test_rate_limit_variants():
    for text in [
        "Error code: 429 - rate_limit_exceeded",
        "Too Many Requests",
        "Max retries exceeded after 3 attempts",
        "Rate limit reached for model llama-3.3-70b-versatile",
    ]:
        assert classify_exception(Exception(text)) == "RATE_LIMIT_EXHAUSTED", text


def test_database_failures():
    assert classify_exception(ServerSelectionTimeoutError("timed out")) == "DB_UNAVAILABLE"
    assert classify_exception(OperationFailure("bad auth : authentication failed", code=8000)) == "DB_UNAVAILABLE"
    assert classify_exception(Exception("bad auth : authentication failed")) == "DB_UNAVAILABLE"
    assert classify_exception(Exception("AtlasError something")) == "DB_UNAVAILABLE"


def test_explicit_council_errors_keep_their_code():
    assert classify_exception(CouncilError("NO_DATA")) == "NO_DATA"


def test_everything_else_is_internal():
    assert classify_exception(KeyError("x")) == "INTERNAL"
    assert classify_exception(ValueError("boom")) == "INTERNAL"


def test_messages_are_fixed_strings_for_every_code():
    for code in ["RATE_LIMIT_EXHAUSTED", "DB_UNAVAILABLE", "NO_DATA", "INTERNAL"]:
        assert isinstance(safe_message(code), str) and safe_message(code)
    assert safe_message("anything-else") == safe_message("INTERNAL")


def test_messages_never_contain_connection_details():
    for code in ["RATE_LIMIT_EXHAUSTED", "DB_UNAVAILABLE", "NO_DATA", "INTERNAL"]:
        text = safe_message(code).lower()
        assert "mongodb" not in text and "password" not in text and "bad auth" not in text
