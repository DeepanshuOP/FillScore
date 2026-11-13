"""The packet loader reads the database named by MONGO_DB_NAME, like persistence and the router do (default "fillscore").
Before 2026-11-14 it ignored the variable, so a deployment with another database name built packets from the wrong one."""
import asyncio

import pytest

from agents.metrics import loader


class _Cursor:
    def sort(self, *_a):
        return self

    def __aiter__(self):
        async def gen():
            if False:
                yield
        return gen()


class _Client:
    def __init__(self):
        self.names = []

    def __getitem__(self, name):
        self.names.append(name)
        return {"trades": type("C", (), {"find": lambda self, *_a: _Cursor()})()}

    def close(self):
        pass


@pytest.mark.parametrize("env, expected", [(None, "fillscore"), ("fillscore_e2e", "fillscore_e2e")])
def test_load_trades_reads_the_named_database(monkeypatch, env, expected):
    client = _Client()
    monkeypatch.setattr(loader, "_get_mongo_client", lambda: client)
    if env is None:
        monkeypatch.delenv("MONGO_DB_NAME", raising=False)
    else:
        monkeypatch.setenv("MONGO_DB_NAME", env)
    asyncio.run(loader.load_trades("u", "BTCUSDT"))
    assert client.names == [expected]


def test_an_explicit_db_name_wins(monkeypatch):
    client = _Client()
    monkeypatch.setattr(loader, "_get_mongo_client", lambda: client)
    monkeypatch.setenv("MONGO_DB_NAME", "from_env")
    asyncio.run(loader.load_trades("u", "BTCUSDT", db_name="explicit"))
    assert client.names == ["explicit"]
