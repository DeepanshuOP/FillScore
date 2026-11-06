"""Sentry event scrubber (pure). Nothing sensitive may leave the process in an error event:
request bodies, Authorization, cookies, any field whose name looks like a key/secret/token/password/uri,
exchange API key payloads, and connection-string values."""
from __future__ import annotations

import re
from typing import Any

SENSITIVE_KEY = re.compile(r"key|secret|token|password|passphrase|passwd|uri|authorization|cookie|credential",
                           re.I)
_URI_VALUE = re.compile(r"\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|amqp)://\S+", re.I)
_BEARER = re.compile(r"\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+", re.I)
FILTERED = "[Filtered]"


_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_QUERY = re.compile(r"(?<=\S)\?[^\s#\"']+")   # URL query strings carry tokens / OAuth codes


def _clean_str(s: str) -> str:
    return _QUERY.sub("?" + FILTERED, _EMAIL.sub(FILTERED, _BEARER.sub(FILTERED, _URI_VALUE.sub(FILTERED, s))))


def scrub_value(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: (FILTERED if isinstance(k, str) and SENSITIVE_KEY.search(k) else scrub_value(v))
                for k, v in node.items()}
    if isinstance(node, (list, tuple)):
        return [scrub_value(v) for v in node]
    if isinstance(node, str):
        return _clean_str(node)
    return node


def before_send(event: dict, hint: dict | None = None) -> dict | None:
    req = event.get("request")
    if isinstance(req, dict):
        for k in ("data", "cookies", "query_string"):
            req.pop(k, None)
    event.pop("user", None)   # no identity leaves; ids reach logs only as a hash (B3)
    return scrub_value(event)
