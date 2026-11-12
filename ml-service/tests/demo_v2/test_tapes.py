"""demo_v2.tapes: Bybit and OKX public spot trade archives into AggTradeWindow (M2, plan §2; facts in LOG §J).

Bybit fixture: verbatim 14:00-14:02 UTC slice of https://public.bybit.com/spot/BTCUSDT/BTCUSDT_2024-01-15.csv.gz
(header + 329 rows; full-file SHA-256 ad4c8b87..., our own hash: Bybit publishes none). First data row:
    118107,1705327200336,42851.44,0.189509,sell
Day index of 2024-01-15 = 19737 days since 1970-01-01, so its aggregate id is 19737 x 10^9 + 118107.
"""
import gzip
import io
import zipfile

import pytest

from demo_v2 import tapes
from measure.data.aggtrades import TimestampUnitError
from tests.measure.conftest import MARKET

BYBIT_FIX = MARKET / "bybit-BTCUSDT-2024-01-15_1400-1402.csv.gz"


def test_bybit_fixture_first_row_and_side():
    raw = gzip.decompress(BYBIT_FIX.read_bytes())
    w = tapes.parse_bybit_csv(raw, "BTCUSDT", "2024-01-15", refs=())
    assert len(w) == 329
    r = w.row(0)
    assert r.agg_id == 19737 * 10**9 + 118107
    assert (r.price, r.qty, r.ts_ms) == (42851.44, 0.189509, 1705327200336)
    assert r.is_buyer_maker is True                   # side "sell" = the seller was the aggressor
    assert int(w.ts_ms[-1]) == 1705327319491
    buys = int((~w.is_buyer_maker).sum())
    assert buys == sum(1 for line in raw.decode().splitlines()[1:] if line.endswith(",buy"))


def test_bybit_refuses_unknown_side_and_non_ms_timestamps():
    with pytest.raises(ValueError):
        tapes.parse_bybit_csv(b"id,timestamp,price,volume,side\n1,1705327200336,1.0,1.0,hold\n", "X", "2024-01-15", ())
    with pytest.raises(TimestampUnitError):                    # seconds (older Bybit files) are refused, not guessed
        tapes.parse_bybit_csv(b"id,timestamp,price,volume,side\n1,1705327200.336,1.0,1.0,buy\n", "X", "2024-01-15", ())


def test_bybit_loader_url_and_own_checksum(tmp_path):
    seen = []
    data = BYBIT_FIX.read_bytes()

    def opener(url):
        seen.append(url)
        return data
    w = tapes.load_bybit_day("BTCUSDT", "2024-01-15", tmp_path, opener=opener)
    assert seen == ["https://public.bybit.com/spot/BTCUSDT/BTCUSDT_2024-01-15.csv.gz"]
    import hashlib
    ref = w.refs[0]
    assert ref.source == "public.bybit.com" and ref.sha256 == hashlib.sha256(data).hexdigest()
    assert tapes.load_bybit_day("BTCUSDT", "2024-01-15", tmp_path, opener=lambda u: 1 / 0).refs[0].sha256 == ref.sha256  # cached
    with pytest.raises(ValueError):
        tapes.load_bybit_day("../x", "2024-01-15", tmp_path, opener=opener)


def _okx_zip(day: str, rows: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(f"BTC-USDT-trades-{day}.csv", "instrument_name,trade_id,side,price,size,created_time\n" + "\n".join(rows) + "\n")
    return buf.getvalue()


def test_okx_utc_day_takes_two_utc_plus_8_files():
    # An OKX daily file D covers D-1 16:00 UTC .. D 16:00 UTC. UTC day 2024-01-15 [1705276800000, 1705363200000)
    # = the end of file 2024-01-15 plus the start of file 2024-01-16.
    f15 = _okx_zip("2024-01-15", [
        "BTC-USDT,100,buy,42000.1,0.5,1705248000099",       # 2024-01-14 16:00 UTC: previous UTC day, dropped
        "BTC-USDT,101,sell,42000.0,9.88e-05,1705276800000",  # exactly 00:00 UTC: kept; size in scientific notation
        "BTC-USDT,102,buy,42000.2,1.0,1705330000000",
    ])
    f16 = _okx_zip("2024-01-16", [
        "BTC-USDT,103,sell,41999.9,2.0,1705334400000",       # 16:00 UTC on the 15th: kept
        "BTC-USDT,104,buy,42001.0,1.0,1705363200000",       # 00:00 UTC on the 16th: next UTC day, dropped
    ])
    files = {"2024-01-15": f15, "2024-01-16": f16}
    urls = []

    def opener(url):
        urls.append(url)
        return files[url.split("-trades-")[1][:10]]
    w = tapes.load_okx_utc_day("BTC-USDT", "2024-01-15", None, opener=opener)
    assert urls == ["https://www.okx.com/cdn/okex/traderecords/trades/daily/20240115/BTC-USDT-trades-2024-01-15.zip",
                    "https://www.okx.com/cdn/okex/traderecords/trades/daily/20240116/BTC-USDT-trades-2024-01-16.zip"]
    assert w.agg_id.tolist() == [101, 102, 103]
    assert w.qty.tolist() == pytest.approx([9.88e-05, 1.0, 2.0])
    assert w.is_buyer_maker.tolist() == [True, False, True]
    assert w.symbol == "BTC-USDT" and len(w.refs) == 2


def test_okx_refuses_another_instrument_in_the_file():
    bad = _okx_zip("2024-01-15", ["ETH-USDT,1,buy,2500.0,1.0,1705300000000"])
    with pytest.raises(ValueError):
        tapes.parse_okx_zip(bad, "BTC-USDT", ())
