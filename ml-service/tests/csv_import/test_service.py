"""run_check: one CSV in, one result out (M6 §1). Limits: at most 200 fills (a bigger file is refused, never cut), 200,000 characters.
Provenance is stated in the result: the Kraken reading is built from Kraken's documentation and is not yet checked against a real file;
a mapped file is read with the user's own mapping.

Same hand-computed tape as test_check.py: mid before each fill 100.00; the buy of 1.0 at 100.02 has an effective half-spread of 2.0 bps and
a fee of 16.0 bps; the sell of 1.0 at 99.98 the same. Together: cost against the mid 0.04, fees 0.32 (quote units)."""
import pytest

from csv_import.service import MAX_FILLS, CsvCheckError, run_check
from tests.csv_import.test_check import F1, F2, Source

KRAKEN = ("txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers\n"
          "T1,OT1,XBT/USD,2024-01-15 14:00:01.1230,buy,market,100.02,100.02,0.160032,1.0,0,initiated,\n"
          "T2,OT2,XBT/USD,2024-01-15 14:00:11.1230,sell,market,99.98,99.98,0.159968,1.0,0,initiated,\n")


def test_kraken_file_gives_the_hand_computed_result_with_its_provenance():
    r = run_check("kraken", KRAKEN, None, Source())
    assert r["format"] == "kraken"
    assert "not yet checked against a real file" in r["provenance"]
    s = r["summary"]
    assert s["fills"] == 2 and s["measured"] == 2
    assert s["median_eff_half_bps"] == pytest.approx(2.0) and s["total_eff_cost_usd"] == pytest.approx(0.04) and s["total_fee_usd"] == pytest.approx(0.32)
    a = r["fills"][0]
    assert (a["txid"], a["symbol"], a["ts_ms"]) == ("T1", "BTCUSDT", F1)
    assert a["eff_half_bps"] == pytest.approx(2.0) and a["fee_bps"] == pytest.approx(16.0) and a["total_bps"] == pytest.approx(18.0)
    assert r["skipped"] == [] and r["limits"]["max_fills"] == MAX_FILLS
    assert any("assumption" in x.lower() for x in r["assumptions"])


def test_mapped_file_says_how_it_was_read():
    csv = ("Time,Product,Side,Price,Size,Fee\n2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0,0.160032\n")
    m = {"time": "Time", "pair": "Product", "side": "Side", "price": "Price", "quantity": "Size", "fee": "Fee", "time_format": "iso"}
    r = run_check("mapped", csv, m, Source())
    assert "your column mapping" in r["provenance"] and r["summary"]["measured"] == 1
    assert any("UTC" in x for x in r["assumptions"])                       # a time with no zone is read as UTC
    assert any("fee" in x.lower() and "quote" in x.lower() for x in r["assumptions"])


def test_a_mapped_file_without_a_fee_column_says_the_fee_was_not_part_of_the_check():
    csv = "Time,Product,Side,Price,Size\n2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0\n"
    m = {"time": "Time", "pair": "Product", "side": "Side", "price": "Price", "quantity": "Size", "time_format": "iso"}
    r = run_check("mapped", csv, m, Source())
    assert r["fee_known"] is False and r["summary"]["total_fee_usd"] is None and r["summary"]["weighted_fee_bps"] is None


def test_skipped_rows_are_listed_with_row_number_and_reason():
    r = run_check("kraken", KRAKEN + "T3,OT3,XBT/USD,2024-01-15 14:00:21,buy,market,100,100,0.1,1.0,2,,\n", None, Source())
    assert r["skipped"] == [{"row": 4, "reason": "margin trade"}]
    assert r["summary"]["fills"] == 2


def test_a_file_with_more_than_200_fills_is_refused_not_cut():
    rows = "".join(f"T{i},O{i},XBT/USD,2024-01-15 14:00:01.1230,buy,market,100.02,100.02,0.16,1.0,0,,\n" for i in range(201))
    with pytest.raises(CsvCheckError) as e:
        run_check("kraken", KRAKEN.splitlines()[0] + "\n" + rows, None, Source())
    assert e.value.code == "too_many_fills" and "201" in e.value.message and "200" in e.value.message


def test_a_file_over_the_size_cap_is_refused():
    with pytest.raises(CsvCheckError) as e:
        run_check("kraken", "x" * 200_001, None, Source())
    assert e.value.code == "file_too_large"


def test_a_file_that_is_not_the_format_is_refused_with_a_reason():
    with pytest.raises(CsvCheckError) as e:
        run_check("kraken", "a,b\n1,2\n", None, Source())
    assert e.value.code == "not_readable" and "missing columns" in e.value.message
    with pytest.raises(CsvCheckError) as e2:
        run_check("mapped", "a,b\n1,2\n", {"time": "a"}, Source())
    assert e2.value.code == "not_readable"
    with pytest.raises(CsvCheckError) as e3:
        run_check("coinbase", "a\n", None, Source())
    assert e3.value.code == "unknown_format"


def test_no_fill_in_the_file_is_not_a_result():
    with pytest.raises(CsvCheckError) as e:
        run_check("kraken", KRAKEN.splitlines()[0] + "\n", None, Source())
    assert e.value.code == "no_fills"


def test_market_data_after_the_deadline_is_unmeasured_never_zero():
    t = {"now": 0.0}

    def clock():
        return t["now"]

    class Slow(Source):
        def __call__(self, symbol, start, end):
            out = super().__call__(symbol, start, end)
            t["now"] += 100.0                                    # the first request takes longer than the whole budget
            return out

    r = run_check("kraken", KRAKEN, None, Slow(), deadline_s=60.0, clock=clock)
    a, b = r["fills"]
    assert a["eff_half_bps"] == pytest.approx(2.0)
    assert b["eff_half_bps"] is None and b["unmeasured_reason"] == "market data could not be fetched"
    assert r["summary"]["measured"] == 1 and r["summary"]["unmeasured"] == 1
