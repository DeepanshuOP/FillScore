"""Effective commission rate from a Binance commission snapshot.

Source: Binance spot "Commission FAQ", https://developers.binance.com/docs/binance-spot-api-docs/faqs/commission_faq
(read 2026-11-11). Formula as stated there:
  Standard = notional x (taker + seller)        [for a taker sell; maker / buyer by analogy]
  Tax      = notional x (taker + seller)
  Special  = notional x (taker + seller)
  Standard (discounted, in BNB) = (Standard / BNB price) x discount
  Total (in BNB) = Standard discounted + Tax + Special; "The discount does not apply to tax or special commissions."
Worked example on that page: MARKET SELL 0.49975 BTC at 35,000 USDT -> notional 17,491.25 USDT; 1 BNB = 260 USDT;
discount 0.25; standard taker 0.00000020, seller 0.00000040; tax taker 0.00000114, seller 0.00000116;
special taker 0.02, seller 0.04. Total = 4.036607129 BNB.
  rate = 0.0000006 x 0.25 + 0.0000023 + 0.06 = 0.06000245
  17,491.25 x 0.06000245 / 260 = 1049.5178535675 / 260 = 4.0366071291...
"""
import pytest

from measure.fees import effective_rate

FAQ = {
    "standard": {"maker": 0.0000001, "taker": 0.0000002, "buyer": 0.0000003, "seller": 0.0000004},
    "tax": {"maker": 0.00000112, "taker": 0.00000114, "buyer": 0.00000118, "seller": 0.00000116},
    "special": {"maker": 0.01, "taker": 0.02, "buyer": 0.03, "seller": 0.04},
    "discount": {"enabledForAccount": True, "enabledForSymbol": True, "asset": "BNB", "rate": 0.25},
}


def test_effective_rate_faq_example():
    r = effective_rate(FAQ, side="SELL", is_maker=False, paid_in_discount_asset=True)
    assert r == pytest.approx(0.06000245, rel=1e-12)
    assert 17491.25 * r / 260 == pytest.approx(4.036607129, abs=1e-9)


def test_no_discount_when_not_paid_in_discount_asset():
    # 0.0000006 + 0.0000023 + 0.06 = 0.0600029
    assert effective_rate(FAQ, "SELL", False, paid_in_discount_asset=False) == pytest.approx(0.0600029, rel=1e-12)


@pytest.mark.parametrize("acct,sym", [(False, True), (True, False)])
def test_discount_needs_both_flags(acct, sym):
    snap = {**FAQ, "discount": {**FAQ["discount"], "enabledForAccount": acct, "enabledForSymbol": sym}}
    assert effective_rate(snap, "SELL", False, True) == pytest.approx(0.0600029, rel=1e-12)


def test_maker_buy_uses_maker_and_buyer_parts():
    # standard 0.0000001 + 0.0000003 = 0.0000004, x 0.25 = 0.0000001; tax 0.00000112 + 0.00000118 = 0.0000023;
    # special 0.01 + 0.03 = 0.04. Total 0.0400024.
    assert effective_rate(FAQ, "BUY", True, True) == pytest.approx(0.0400024, rel=1e-12)


def test_typical_account_without_tax_or_special():
    snap = {"standard": {"maker": 0.001, "taker": 0.001, "buyer": 0, "seller": 0},
            "tax": {"maker": 0, "taker": 0, "buyer": 0, "seller": 0},
            "special": {"maker": 0, "taker": 0, "buyer": 0, "seller": 0},
            "discount": {"enabledForAccount": True, "enabledForSymbol": True, "asset": "BNB", "rate": 0.75}}
    assert effective_rate(snap, "BUY", False, True) == pytest.approx(0.00075, rel=1e-12)    # 0.001 x 0.75
    assert effective_rate(snap, "BUY", False, False) == pytest.approx(0.001, rel=1e-12)


@pytest.mark.parametrize("side", ["buy", "X", None])
def test_bad_side_rejected(side):
    with pytest.raises(ValueError):
        effective_rate(FAQ, side, False, False)


def test_missing_part_rejected():
    with pytest.raises(ValueError):
        effective_rate({"standard": {"maker": 0.001}}, "BUY", True, False)
