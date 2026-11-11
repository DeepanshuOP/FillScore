"""Metric registry. Every v2 metric is a pure function registered here with its unit, inputs and formula text.

The methodology page is generated from this registry (`methodology_markdown`), so the published method cannot
drift from the code that computes the numbers.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from config.versions import MEASURE_VERSION

REGISTRY: dict[str, "MetricSpec"] = {}


@dataclass(frozen=True)
class MetricSpec:
    id: str
    unit: str
    inputs: list[str]
    doc: str
    fn: Callable
    version: str = MEASURE_VERSION


def metric(*, id: str, unit: str, inputs: list[str], doc: str) -> Callable[[Callable], Callable]:
    """Register `fn` under `id`. Returns `fn` unchanged. A second registration of the same id is an error."""

    def register(fn: Callable) -> Callable:
        if id in REGISTRY:
            raise ValueError(f"metric id already registered: {id}")
        REGISTRY[id] = MetricSpec(id=id, unit=unit, inputs=list(inputs), doc=doc, fn=fn)
        return fn

    return register


def methodology_markdown() -> str:
    """One section per metric, sorted by id: unit, inputs and the formula text."""
    lines = [f"# Measurement methodology (version {MEASURE_VERSION})", ""]
    for mid in sorted(REGISTRY):
        spec = REGISTRY[mid]
        lines += [
            f"### `{spec.id}`",
            "",
            f"- Unit: {spec.unit}",
            f"- Inputs: {', '.join(spec.inputs) if spec.inputs else 'none'}",
            "",
            spec.doc.strip(),
            "",
        ]
    return "\n".join(lines)
