"""Kraken Trades CSV importer (M6 §1). Built from Kraken's help page "How to interpret trades history fields" (LOG §S), NOT from a real
export: the sample rows below are hand-made from that page's field definitions. A real export is a Waiting item; until then the importer
matches headers by NAME (it accepts "order-type" as the help page spells it and "ordertype" as the API does) and refuses what it cannot
ground, with the reason.

Fixture facts (from the page): time is UTC "YYYY-MM-DD HH:MM:SS.0000"; cost = price x volume, in the quote currency and without the fee;
fee is in the quote currency; vol is in the base currency; margin 0 = a non-margin trade; misc "initiated" = a taker order.
Hand arithmetic:
  2024-01-15 00:00:00 UTC = 1,705,276,800 s; + 14 h (50,400 s) = 1,705,327,200 s; "14:00:01.1234" -> 1,705,327,201.1234 s -> 1705327201123 ms (floored)
  row 1: price 42000, vol 0.1 -> cost 4200.0 = 42000 x 0.1 (matches); fee 6.72 / cost 4200 = 0.0016 = 16 bps"""
import pytest

from csv_import.kraken import parse_trades, reference_symbol, split_pair

HEADER = '"txid","ordertxid","pair","time","type","ordertype","price","cost","fee","vol","margin","misc","ledgers"'


def _csv(*rows, header=HEADER):
    return "\n".join([header, *rows]) + "\n"


R1 = '"T1","O1","XBT/USD","2024-01-15 14:00:01.1234","buy","market","42000.0","4200.0","6.72","0.1","0","initiated","L1,L2"'
R2 = '"T2","O1","XXBTZUSD","2024-01-15 14:00:02.0000","sell","limit","42010.0","2100.5","3.36","0.05","0","","L3,L4"'


def test_a_row_is_read_with_its_documented_meaning():
    r = parse_trades(_csv(R1))
    assert r.skipped == [] and len(r.fills) == 1
    f = r.fills[0]
    assert (f.txid, f.order_id, f.base, f.quote, f.side) == ("T1", "O1", "XBT", "USD", 1)
    assert f.ts_ms == 1705327201123
    assert (f.price, f.qty, f.cost, f.fee) == (42000.0, 0.1, 4200.0, 6.72)
    assert f.fee_bps == pytest.approx(16.0)
    assert f.taker is True and f.order_type == "market"


def test_a_row_without_the_taker_mark_is_unknown_not_maker():
    f = parse_trades(_csv(R2)).fills[0]
    assert f.taker is None and f.side == -1 and (f.base, f.quote) == ("XBT", "USD")     # "XXBTZUSD": X and Z prefixes of the 4-letter codes


def test_the_header_is_matched_by_name_in_any_order_and_either_spelling_of_order_type():
    header = '"vol","pair","txid","time","type","order-type","price","cost","fee","ordertxid","margin","misc","ledgers"'
    row = '"0.1","XBT/USD","T1","2024-01-15 14:00:01.1234","buy","market","42000.0","4200.0","6.72","O1","0","initiated","L1"'
    f = parse_trades(_csv(row, header=header)).fills[0]
    assert (f.txid, f.qty, f.order_type) == ("T1", 0.1, "market")


def test_a_byte_order_mark_and_windows_line_ends_are_fine():
    text = "﻿" + _csv(R1).replace("\n", "\r\n")
    assert len(parse_trades(text).fills) == 1


def test_a_file_that_is_not_a_trades_export_is_refused_with_the_missing_columns():
    with pytest.raises(ValueError, match="missing columns: price, vol"):
        parse_trades('"txid","ordertxid","pair","time","type","ordertype","cost","fee","margin","misc","ledgers"\n"T1","O1","XBT/USD","2024-01-15 14:00:01.0000","buy","market","1","1","0","",""\n')


@pytest.mark.parametrize("row,reason", [
    ('"T3","O3","XBT/USD","2024-01-15 14:00:01.0000","buy","market","42000.0","4200.0","6.72","0.1","2","","L"', "margin trade"),
    ('"T4","O4","XBT/USD","2024-01-15 14:00:01.0000","buy","market","42000.0","4300.0","6.72","0.1","0","initiated","L"', "cost is not price x volume"),
    ('"T5","O5","XBT/USD","2024-01-15 14:00:01.0000","hold","market","42000.0","4200.0","6.72","0.1","0","initiated","L"', "unknown side"),
    ('"T6","O6","XBT/USD","15/01/2024 14:00","buy","market","42000.0","4200.0","6.72","0.1","0","initiated","L"', "time is not YYYY-MM-DD HH:MM:SS"),
    ('"T7","O7","XBT/USD","2024-01-15 14:00:01.0000","buy","market","0","0","6.72","0.1","0","initiated","L"', "price and volume must be positive"),
    ('"T8","O8","XBT/USD","2024-01-15 14:00:01.0000","buy","market","abc","4200.0","6.72","0.1","0","initiated","L"', "a number could not be read"),
    ('"T9","O9","NOTAPAIR","2024-01-15 14:00:01.0000","buy","market","42000.0","4200.0","6.72","0.1","0","initiated","L"', "pair not recognised"),
])
def test_a_row_that_cannot_be_grounded_is_skipped_with_its_reason_and_row_number(row, reason):
    r = parse_trades(_csv(R1, row))
    assert len(r.fills) == 1 and r.skipped == [(3, reason)]          # row 3 of the file: header is row 1


def test_pair_names_in_both_forms_the_official_page_shows():
    # https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs: XXBTZUSD has altname XBTUSD and wsname XBT/USD
    assert split_pair("XBT/USD") == ("XBT", "USD")
    assert split_pair("XBTUSD") == ("XBT", "USD")
    assert split_pair("XXBTZUSD") == ("XBT", "USD")
    assert split_pair("ETH/USDT") == ("ETH", "USDT")
    assert split_pair("XETHZEUR") == ("ETH", "EUR")
    assert split_pair("garbage") is None
    assert split_pair("") is None


def test_the_reference_market_is_binance_usdt_and_that_is_an_assumption():
    assert reference_symbol("XBT", "USD") == ("BTCUSDT", None)
    assert reference_symbol("ETH", "USDT") == ("ETHUSDT", None)
    assert reference_symbol("SOL", "USDC") == ("SOLUSDT", None)
    sym, why = reference_symbol("XBT", "EUR")
    assert sym is None and "EUR" in why                                 # no reference for a non-dollar quote
    sym, why = reference_symbol("ABCDEFGHI", "USD")
    assert sym is None and "base" in why
