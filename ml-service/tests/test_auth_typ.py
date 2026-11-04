"""F-27 (phase 1a item 1.6, review follow-up): the ml-service verifies backend-issued access tokens.
It must pin HS256 and accept only typ == "access", so a refresh token, a typ-less legacy token or any
other token signed with the same secret is refused."""
import time

import jwt
import pytest
from fastapi import HTTPException
from starlette.requests import Request

import main


def _req(token: str) -> Request:
    return Request({"type": "http", "headers": [(b"authorization", f"Bearer {token}".encode())]})


def _tok(claims: dict, alg: str = "HS256") -> str:
    return jwt.encode({"exp": int(time.time()) + 60, **claims}, main.JWT_ACCESS_SECRET, algorithm=alg)


def test_access_token_is_accepted():
    assert main.get_account_id(None, _req(_tok({"userId": "u1", "typ": "access"}))) == "u1"


@pytest.mark.parametrize("claims", [
    {"userId": "u1"},                        # legacy, no typ
    {"userId": "u1", "typ": "refresh"},      # wrong type
    {"userId": "u1", "typ": "oauth_state"},  # any other token signed with the secret
])
def test_non_access_tokens_are_refused(claims):
    with pytest.raises(HTTPException) as exc:
        main.get_account_id(None, _req(_tok(claims)))
    assert exc.value.status_code == 401


def test_other_algorithms_are_refused():
    with pytest.raises(HTTPException):
        main.get_account_id(None, _req(_tok({"userId": "u1", "typ": "access"}, alg="HS512")))
