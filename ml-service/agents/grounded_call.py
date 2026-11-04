"""Glue between a Council LLM call and agents.grounding (Phase 1c.3).

Text fields of a model's output are addressed by dotted patterns over its JSON dump, with `*` for
list items: "slippageRoot", "flags.*", "claims.*.claim_text", "conflictLedger.*.between".
`grounded_model` runs grounding.grounded_complete (check → one regeneration → redaction) and returns
the model with cleaned *templates*; `finalized` then renders them, so no unrendered or unverified
text leaves this module.
"""
from __future__ import annotations

import copy
from typing import Callable

from agents.grounding import GroundingFailed, GroundingLedger, finalize, grounded_complete

CtxFor = Callable[[str], dict]


def collect(data: dict, patterns: list[str]) -> dict[str, str]:
    """{concrete dotted path: text} for every string matched by the patterns."""
    out: dict[str, str] = {}

    def walk(node, segs: list[str], path: list[str]) -> None:
        if not segs:
            if isinstance(node, str):
                out[".".join(path)] = node
            return
        head, rest = segs[0], segs[1:]
        if head == "*":
            if isinstance(node, list):
                for i, item in enumerate(node):
                    walk(item, rest, path + [str(i)])
        elif isinstance(node, dict) and head in node:
            walk(node[head], rest, path + [head])

    for pattern in patterns:
        walk(data, pattern.split("."), [])
    return out


def assign(data: dict, values: dict[str, str]) -> dict:
    """A deep copy of `data` with each dotted path set to its new text."""
    data = copy.deepcopy(data)
    for path, text in values.items():
        *parents, last = path.split(".")
        node = data
        for seg in parents:
            node = node[int(seg)] if isinstance(node, list) else node[seg]
        if isinstance(node, list):
            node[int(last)] = text
        else:
            node[last] = text
    return data


async def grounded_model(llm, role: str, system: str, user: str, schema, *, agent: str, patterns: list[str],
                         ctx_for: CtxFor, ledger: GroundingLedger, telemetry=None, max_tokens: int,
                         temperature: float = 0.1, allow_regen: bool = True):
    """The validated model with its text fields replaced by cleaned templates (not yet rendered)."""
    return await grounded_complete(
        llm, role, system, user, schema, agent=agent,
        fields=lambda out: collect(out.model_dump(), patterns),
        apply=lambda out, tpl: type(out).model_validate(assign(out.model_dump(), tpl)),
        ctx_for=ctx_for, ledger=ledger, telemetry=telemetry, max_tokens=max_tokens,
        temperature=temperature, allow_regen=allow_regen,
    )


def finalized(model, patterns: list[str], ctx_for: CtxFor, agent: str, ledger: GroundingLedger | None) -> dict:
    """The model's JSON dump with every matched text field rendered by grounding.finalize."""
    data = model.model_dump()
    texts = {p: finalize(t, ctx_for(p), agent, p, ledger) for p, t in collect(data, patterns).items()}
    return assign(data, texts)


async def grounded_verdict(llm, role: str, system: str, user: str, schema, *, agent: str, text_field: str | None,
                           ctx: dict, ledger: GroundingLedger | None, telemetry=None, max_tokens: int,
                           namespace: str | None = None):
    """A specialist verdict with its explanation and flags grounded and rendered. Empty flags are
    dropped; an explanation emptied by redaction raises GroundingFailed (the agent failed).
    Non-text fields the model wrote are not trusted: `agent` is forced to the module's constant and
    `cited_evidence` keeps only keys of this agent's packet (`ctx[namespace]`), order kept, no repeats."""
    ledger = ledger if ledger is not None else GroundingLedger()
    patterns = ([text_field] if text_field else []) + ["flags.*"]
    out = await grounded_model(llm, role, system, user, schema, agent=agent, patterns=patterns,
                               ctx_for=lambda _p: ctx, ledger=ledger, telemetry=telemetry, max_tokens=max_tokens)
    data = finalized(out, patterns, lambda _p: ctx, agent, ledger)
    if text_field and not str(data.get(text_field, "")).strip():
        raise GroundingFailed(agent, text_field)
    data["flags"] = [f for f in data.get("flags", []) if f.strip()]
    data["agent"] = agent
    if "cited_evidence" in data:
        allowed = ctx.get(namespace, {}) if namespace else {}
        data["cited_evidence"] = list(dict.fromkeys(k for k in data["cited_evidence"] if k in allowed))
    return schema.model_validate(data)
