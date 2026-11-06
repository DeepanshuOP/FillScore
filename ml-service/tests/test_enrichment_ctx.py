"""4a Q5: markout.* and spread.* placeholder namespaces. Present ONLY when trades carry enrichment, so
un-enriched accounts (all demo accounts today) get byte-identical prompts and golden packets."""
from agents.render import catalog_entries, enrichment_ctx, render
from tests.test_markout_packet import TRADES


def test_absent_without_enrichment():
    assert enrichment_ctx([{"id": "x", "side": "BUY", "executionPrice": 1.0, "notionalValue": 1.0}]) == {}
    assert enrichment_ctx([]) == {}


def test_markout_keys_and_formats():
    ctx = enrichment_ctx(TRADES)
    entries = dict(catalog_entries(ctx, ["markout", "spread"]))
    # h=1: simple mean (10+50)/2 = 30.0 ; notional-weighted (1000*10+3000*50)/4000 = 40.0 ; 2 fills ; adverse 0%
    assert entries["markout.h1_mean_bps"] == "30.0 bps"
    assert entries["markout.h1_weighted_mean_bps"] == "40.0 bps"
    assert entries["markout.h1_maker_mean_bps"] == "10.0 bps" and entries["markout.h1_taker_mean_bps"] == "50.0 bps"
    assert entries["markout.n_fills_h1"] == "2"
    assert entries["markout.adverse_share.h1"] == "0.0%"
    # h=60: only the buy -> -10 bps, adverse share 100%
    assert entries["markout.h60_mean_bps"] == "-10.0 bps" and entries["markout.adverse_share.h60"] == "100.0%"
    assert "markout.h60_taker_mean_bps" not in entries          # None -> not renderable, never 0


def test_placeholder_renders_and_unknown_does_not():
    ctx = enrichment_ctx(TRADES)
    assert render("Buys moved {{markout.h1_mean_bps}}.", ctx).text == "Buys moved 30.0 bps."
    assert render("Median {{markout.h5_median_bps}}.", ctx).text == "Median 0.0 bps."      # h5: sell only, 0 bps
    assert render("{{markout.h999_mean_bps}}", ctx).problems                              # unknown key is a violation


def test_spread_keys():
    t = [{**TRADES[0], "halfSpreadBps": 1.5, "spreadBps": {"cs": 4.0, "ar": 3.0}}]
    e = dict(catalog_entries(enrichment_ctx(t), ["spread"]))
    # conservative = min(4.0, 3.0) = 3.0 bps ; half = 1.5
    assert e["spread.cs_bps"] == "4.0 bps" and e["spread.ar_bps"] == "3.0 bps"
    assert e["spread.conservative_bps"] == "3.0 bps" and e["spread.half_spread_bps"] == "1.5 bps"
