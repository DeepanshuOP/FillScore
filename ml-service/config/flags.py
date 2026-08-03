"""Generic feature-flag mechanism (R6-D9). Each flag is a `<FEATURE>_ENABLED` env var,
read at call time so it can change without a redeploy of code (just a restart)."""
import os

_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off"}

_DEFAULT_COUNCIL_MESSAGE = "The Agent Council is temporarily unavailable for maintenance."


def flag_enabled(name: str, default: bool = True) -> bool:
    """Read a boolean flag from the environment. Unset, empty, or unrecognized
    values all fall back to `default` — a typo can never crash the service."""
    raw = os.environ.get(name, "").strip().lower()
    if raw in _TRUTHY:
        return True
    if raw in _FALSY:
        return False
    return default


def council_enabled() -> bool:
    return flag_enabled("COUNCIL_ENABLED", default=True)


def council_maintenance_message() -> str:
    override = os.environ.get("COUNCIL_DISABLED_MESSAGE", "").strip()
    return override if override else _DEFAULT_COUNCIL_MESSAGE
