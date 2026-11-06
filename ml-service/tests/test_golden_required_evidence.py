"""3c T4: each demo golden's required_evidence keys render to values unique within that packet, each key
sits in the namespace of the agent that owns it, and a synthesis requirement exists."""
import collections

import pytest

from agents.render import catalog_entries
from evals.invariants import _ctx, _key_value, _tokens
from evals.run_offline import load_golden

OWNER_NS = {"fee_optimizer": "fee", "risk_auditor": "risk", "liquidity_scout": "liquidity", "alpha_architect": "alpha"}
DEMOS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]
# demo-disciplined: every liquidity value is 0 / "0.0 bps" / a count shared with another field, so no unique key exists
NO_UNIQUE_KEY = {("demo-disciplined", "liquidity_scout")}


@pytest.mark.parametrize("gid", DEMOS)
def test_keys_are_unique_owned_and_synthesis_required(gid):
    g = load_golden()[gid]
    ctx = _ctx(g)
    seen = collections.Counter(t for _p, shown in catalog_entries(ctx, list(g["packet"])) for t in _tokens(shown))
    req = g["required_evidence"]
    assert req["synthesis"], "synthesis requirement missing"
    for agent, keys in req.items():
        if agent != "synthesis":
            assert all(k.split(".")[0] == OWNER_NS[agent] for k in keys), (agent, keys)   # bound to its owner
            assert keys or (gid, agent) in NO_UNIQUE_KEY, f"{gid}/{agent} has no key"
        for k in keys:
            shown = _key_value(ctx, k)
            toks = _tokens(shown)
            assert toks and all(seen[t] == 1 for t in toks), f"{gid} {k} renders {shown!r}, not unique in the packet"
