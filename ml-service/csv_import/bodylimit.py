"""Refuse an oversized request body to one path before the application reads it (review 2026-11-18: FastAPI parsed and validated the body
before it looked at the token, so an anonymous caller could make the service buffer any size). A declared Content-Length over the limit is
refused at once; a body without a length (chunked) is counted as it arrives and cut off at the limit."""
from __future__ import annotations

import json


class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app, path: str, limit: int):
        self.app, self.path, self.limit = app, path, limit

    async def _refuse(self, send) -> None:
        body = json.dumps({"detail": {"code": "file_too_large", "message": "The request is too large."}}).encode()
        await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") != self.path:
            return await self.app(scope, receive, send)
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.limit:
            return await self._refuse(send)
        total = 0

        async def counted():
            nonlocal total
            msg = await receive()
            if msg["type"] == "http.request":
                total += len(msg.get("body", b""))
                if total > self.limit:
                    raise _TooLarge()
            return msg

        try:
            await self.app(scope, counted, send)
        except _TooLarge:
            await self._refuse(send)
