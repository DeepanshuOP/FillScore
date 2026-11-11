"""C1: piecewise-linear score through (a10, 100), (a50, 75), (a90, 40), (a99, 0); 100 below a10, 0 above a99.

Hand values with anchors (-2, 0, 4, 10):
  x = -3 -> 100 (below a10)
  x = -1 -> halfway between -2 and 0:  100 - 0.5 x 25 = 87.5
  x =  2 -> halfway between  0 and 4:   75 - 0.5 x 35 = 57.5
  x =  7 -> halfway between  4 and 10:  40 - 0.5 x 40 = 20.0
  x = 12 -> 0 (above a99)
"""
import math

import pytest

from scoring_v2.anchors import score_from_anchors

A = (-2.0, 0.0, 4.0, 10.0)


@pytest.mark.parametrize("x,want", [(-3, 100.0), (-2, 100.0), (-1, 87.5), (0, 75.0), (2, 57.5), (4, 40.0), (7, 20.0), (10, 0.0), (12, 0.0)])
def test_hand_values(x, want):
    assert score_from_anchors(x, *A) == pytest.approx(want, abs=1e-12)


@pytest.mark.parametrize("bad", [(0, 0, 4, 10), (-2, 0, 0, 10), (-2, 0, 4, 4), (1, 0, 4, 10), (-2, float("nan"), 4, 10)])
def test_anchors_must_strictly_increase(bad):
    with pytest.raises(ValueError):
        score_from_anchors(1.0, *bad)


@pytest.mark.parametrize("x", [float("nan"), float("inf"), None])
def test_non_finite_input_rejected(x):
    with pytest.raises(ValueError):
        score_from_anchors(x, *A)


def test_monotone_non_increasing():
    xs = [i / 10 for i in range(-50, 150)]
    ys = [score_from_anchors(x, *A) for x in xs]
    assert all(a >= b for a, b in zip(ys, ys[1:]))
    assert all(0 <= y <= 100 and math.isfinite(y) for y in ys)
