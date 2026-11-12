"""scripts/build_demo_v2.py DayTapes: windows that cross midnight join two days; nothing after 2024-01-31 is used."""
import importlib.util
from pathlib import Path

from measure.data.aggtrades import AggTradeWindow, MarketDataRef

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "build_demo_v2.py"
D15 = 1_705_276_800_000          # 2024-01-15 00:00 UTC
DAY = 86_400_000


def _mod():
    spec = importlib.util.spec_from_file_location("build_demo_v2", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def fake_day(symbol, day, cache):
    # Two prints per day: 23:59:59.000 of the previous day is not in this file; each file holds 00:00:01 and 23:59:59.
    start = {"2024-01-14": D15 - DAY, "2024-01-15": D15, "2024-01-31": D15 + 16 * DAY}[day]
    ref = MarketDataRef("t", "t", symbol, day, None, day.replace("-", "") * 4)
    return AggTradeWindow.from_rows(symbol, [(start // 1000 + 1, 1.0, 1.0, start + 1000, True),
                                             (start // 1000 + 2, 2.0, 1.0, start + DAY - 1000, False)], [ref])


def test_window_across_midnight_joins_both_days(monkeypatch):
    m = _mod()
    monkeypatch.setattr(m.vision, "load_day", fake_day)
    t = m.DayTapes(Path("unused"))
    w = t("BTCUSDT", D15 - 5000, D15 + 5000)                 # 23:59:55 on the 14th .. 00:00:05 on the 15th
    assert w.ts_ms.tolist() == [D15 - 1000, D15 + 1000]
    assert [r.date for r in w.refs] == ["2024-01-14", "2024-01-15"]
    assert sorted(d for _, d in t.used) == ["2024-01-14", "2024-01-15"]


def test_nothing_after_the_window_is_borrowed(monkeypatch):
    m = _mod()
    monkeypatch.setattr(m.vision, "load_day", fake_day)
    t = m.DayTapes(Path("unused"))
    end_31 = D15 + 17 * DAY                                   # 2024-02-01 00:00
    w = t("BTCUSDT", end_31 - 5000, end_31 + 600_000)
    assert w.ts_ms.tolist() == [end_31 - 1000]                # only the 31st; February is never loaded
    assert sorted(d for _, d in t.used) == ["2024-01-31"]
