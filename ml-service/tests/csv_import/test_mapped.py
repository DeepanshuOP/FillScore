"""A CSV read with a column mapping the user supplies (M6 §1; Coinbase and any other broker, no official format needed).

Hand-computed fixture (a Coinbase-style file; the column names are the user's, not an official format):
  row 1: 2024-01-15T14:00:01.123Z, BTC-USD, BUY, price 100.02, size 1.0, fee 0.160032 USD
         time = 1705327201123 ms (the same instant as 14:00:01.123 UTC on 2024-01-15); cost = price x size = 100.02;
         fee_bps = 0.160032 / 100.02 x 1e4 = 16.0
  row 2: 2024-01-15T14:00:11.123Z, BTC-USD, SELL, price 99.98, size 1.0, fee 0.159968 USD: cost 99.98, fee_bps 16.0
Time rules: an ISO time with Z or an offset is converted to UTC; an ISO time with no zone is read as UTC (stated in the result);
"epoch_s" is seconds and "epoch_ms" is milliseconds since 1970 UTC."""
import pytest

from csv_import.mapped import parse_mapped

HEADER = "Time,Product,Side,Price,Size,Fee,Fee Currency,Trade ID\n"
R1 = "2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0,0.160032,USD,T1\n"
R2 = "2024-01-15T14:00:11.123Z,BTC-USD,SELL,99.98,1.0,0.159968,USD,T2\n"
MAP = {"time": "Time", "pair": "Product", "side": "Side", "price": "Price", "quantity": "Size", "fee": "Fee",
       "fee_currency": "Fee Currency", "id": "Trade ID", "time_format": "iso"}


def test_two_fills_are_read_with_the_users_mapping_hand_computed():
    r = parse_mapped(HEADER + R1 + R2, MAP)
    assert r.skipped == []
    a, b = r.fills
    assert (a.txid, a.base, a.quote, a.side, a.ts_ms) == ("T1", "BTC", "USD", 1, 1705327201123)
    assert a.price == pytest.approx(100.02) and a.qty == pytest.approx(1.0) and a.cost == pytest.approx(100.02)
    assert a.fee == pytest.approx(0.160032) and a.fee_bps == pytest.approx(16.0)
    assert (b.side, b.ts_ms) == (-1, 1705327211123) and b.cost == pytest.approx(99.98) and b.fee_bps == pytest.approx(16.0)
    assert a.taker is None                                     # the file does not say, so it is not said


def test_time_formats():
    base = {**MAP}
    zoned = "2024-01-15T16:00:01.123+02:00,BTC-USD,BUY,100.02,1.0,0.160032,USD,T1\n"
    naive = "2024-01-15T14:00:01.123,BTC-USD,BUY,100.02,1.0,0.160032,USD,T1\n"
    assert parse_mapped(HEADER + zoned, base).fills[0].ts_ms == 1705327201123
    assert parse_mapped(HEADER + naive, base).fills[0].ts_ms == 1705327201123          # no zone: read as UTC
    s = "1705327201,BTC-USD,BUY,100.02,1.0,0.160032,USD,T1\n"
    assert parse_mapped(HEADER + s, {**base, "time_format": "epoch_s"}).fills[0].ts_ms == 1705327201000
    ms = "1705327201123,BTC-USD,BUY,100.02,1.0,0.160032,USD,T1\n"
    assert parse_mapped(HEADER + ms, {**base, "time_format": "epoch_ms"}).fills[0].ts_ms == 1705327201123


def test_a_row_that_cannot_be_grounded_is_skipped_with_its_row_number_and_reason():
    bad = ("not a time,BTC-USD,BUY,100.02,1.0,0.160032,USD,T3\n"
           "2024-01-15T14:00:01.123Z,BTC-USD,HOLD,100.02,1.0,0.160032,USD,T4\n"
           "2024-01-15T14:00:01.123Z,BTC-USD,BUY,-1,1.0,0.160032,USD,T5\n"
           "2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0,0.0005,BTC,T6\n"        # fee in BTC: not converted, not guessed
           "2024-01-15T14:00:01.123Z,FOO,BUY,100.02,1.0,0.160032,USD,T7\n"
           "2024-01-15T14:00:01.123Z,BTC-USD,BUY,abc,1.0,0.160032,USD,T8\n")
    r = parse_mapped(HEADER + R1 + bad, MAP)
    assert [f.txid for f in r.fills] == ["T1"]
    assert dict(r.skipped) == {3: "time is not in the format you gave", 4: "unknown side", 5: "price and quantity must be positive",
                               6: "the fee is in another currency than the quote currency (not converted)", 7: "pair not recognised",
                               8: "a number could not be read"}


def test_fee_and_id_columns_are_optional():
    m = {k: v for k, v in MAP.items() if k not in ("fee", "fee_currency", "id")}
    r = parse_mapped(HEADER + R1, m)
    f = r.fills[0]
    assert f.fee == 0.0 and f.fee_bps == 0.0 and f.txid == "row 2"      # no fee column: the fee is not part of this check, shown as 0 and said
    assert r.fee_known is False


def test_a_mapping_that_names_a_missing_column_is_refused_by_name():
    with pytest.raises(ValueError, match="Nope"):
        parse_mapped(HEADER + R1, {**MAP, "price": "Nope"})


def test_an_incomplete_or_unknown_mapping_is_refused():
    with pytest.raises(ValueError, match="quantity"):
        parse_mapped(HEADER + R1, {k: v for k, v in MAP.items() if k != "quantity"})
    with pytest.raises(ValueError, match="time_format"):
        parse_mapped(HEADER + R1, {**MAP, "time_format": "weird"})
    with pytest.raises(ValueError, match="empty"):
        parse_mapped("", MAP)


def test_numbers_that_are_not_finite_or_underflow_are_skipped_not_measured_and_never_crash():
    # review finding 2026-11-18: inf and nan passed the checks and broke the response; 1e-200 x 1e-200 gives a cost of 0.0 (division by zero)
    rows = ("2024-01-15T14:00:01.123Z,BTC-USD,BUY,inf,1.0,0.1,USD,T1\n"
            "2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,nan,0.1,USD,T2\n"
            "2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0,nan,USD,T3\n"
            "2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0,inf,USD,T4\n"
            "2024-01-15T14:00:01.123Z,BTC-USD,BUY,1e-200,1e-200,0.1,USD,T5\n")
    r = parse_mapped(HEADER + rows + R1, MAP)
    # the five bad rows are rows 2 to 6 of the file; R1 (row 7, a good fill whose id is also "T1") is the only fill read
    assert [n for n, _ in r.skipped] == [2, 3, 4, 5, 6]
    assert len(r.fills) == 1 and r.fills[0].price == pytest.approx(100.02)


def test_a_field_over_the_csv_limit_is_a_refusal_with_a_reason_not_a_crash():
    with pytest.raises(ValueError, match="CSV"):
        parse_mapped(HEADER + "x" * 200_000 + ",BTC-USD,BUY,1,1,0,USD,T\n", MAP)


def test_base_and_quote_columns_can_replace_a_pair_column():
    h = "Time,Base,Quote,Side,Price,Size\n"
    row = "2024-01-15T14:00:01.123Z,BTC,USD,BUY,100.02,1.0\n"
    m = {"time": "Time", "base": "Base", "quote": "Quote", "side": "Side", "price": "Price", "quantity": "Size", "time_format": "iso"}
    f = parse_mapped(h + row, m).fills[0]
    assert (f.base, f.quote) == ("BTC", "USD")
