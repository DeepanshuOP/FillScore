"""B3: request id + hashed account id on one JSON log line per request, and as Sentry tags, so a Sentry
error links to its log line. Never logs an email or the raw account id."""
from __future__ import annotations

import hashlib
import json
import re
import time
import uuid

_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def hash_account_id(account_id: str | None) -> str | None:
    if not account_id:
        return None
    return hashlib.sha256(str(account_id).encode()).hexdigest()[:12]


def install_request_log(app) -> None:
    @app.middleware("http")
    async def _request_log(request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _SAFE_ID.match(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["x-request-id"] = request_id
            return response
        finally:
            account = hash_account_id(getattr(request.state, "account_id", None))
            try:
                import sentry_sdk
                sentry_sdk.set_tag("request_id", request_id)
                if account:
                    sentry_sdk.set_tag("account_hash", account)
            except Exception:
                pass
            print(json.dumps({"msg": "request", "requestId": request_id, "method": request.method,
                              "path": request.url.path, "status": status,
                              "ms": round((time.perf_counter() - start) * 1000, 2), "account": account}),
                  flush=True)
