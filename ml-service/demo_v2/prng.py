"""Exact port of the mulberry32 PRNG used by backend/src/scripts/generateSyntheticTrades.ts (seed 42).

JavaScript keeps the state as a double and converts to 32-bit integers inside each operation; the bit patterns are
identical to unsigned 32-bit arithmetic as long as the state stays below 2**53 (about 4.9 million calls).
"""
from __future__ import annotations

from typing import Callable

_M = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return ((a & _M) * (b & _M)) & _M


def mulberry32(seed: int) -> Callable[[], float]:
    state = seed & _M

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & _M
        t = state
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & _M)) & _M
        return ((t ^ (t >> 14)) & _M) / 4294967296

    return nxt
