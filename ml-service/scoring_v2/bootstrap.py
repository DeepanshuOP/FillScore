"""C4: percentile bootstrap intervals over units (orders). All fills of a drawn order come with it.

Deterministic: numpy.random.default_rng(seed), a fixed seed and 1,000 draws, so the same input always gives the
same interval. A statistic may return None on a resample (for example a component with no measured unit in that
resample); those draws are left out. One unit gives no interval (None).
"""
from __future__ import annotations

from typing import Callable, Sequence, TypeVar

import numpy as np

T = TypeVar("T")
SEED = 20261107
DRAWS = 1000


def bootstrap_ci(units: Sequence[T], statistic: Callable[[list[T]], float | None], draws: int = DRAWS,
                 seed: int = SEED, level: float = 0.95) -> tuple[float, float] | None:
    n = len(units)
    if n < 2:
        return None
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n, size=(draws, n))
    stats = []
    for row in idx:
        v = statistic([units[i] for i in row])
        if v is not None:
            stats.append(float(v))
    if not stats:
        return None
    a = (1 - level) / 2 * 100
    lo, hi = np.percentile(stats, [a, 100 - a])
    return float(lo), float(hi)
