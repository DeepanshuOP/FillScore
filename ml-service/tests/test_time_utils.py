"""1c.1: shared UTC-hour parsing. Expected values hand-computed (see comments)."""
from datetime import datetime, timezone, timedelta
from agents.metrics.time_utils import utc_hour, utc_hour_key


def test_naive_datetime_is_utc():
    assert utc_hour(datetime(2024, 1, 15, 8, 30)) == 8


def test_aware_utc_datetime():
    assert utc_hour(datetime(2024, 1, 15, 8, 30, tzinfo=timezone.utc)) == 8


def test_aware_offset_datetime_converted():
    # 10:30+02:00 = 08:30Z
    assert utc_hour(datetime(2024, 1, 15, 10, 30, tzinfo=timezone(timedelta(hours=2)))) == 8


def test_iso_strings():
    assert utc_hour("2024-01-15T14:10:00Z") == 14
    assert utc_hour("2024-01-15T14:10:00+00:00") == 14
    # 23:30-02:00 = 01:30Z next day
    assert utc_hour("2024-01-15T23:30:00-02:00") == 1
    assert utc_hour("2024-01-15T14:10:00") == 14


def test_invalid_inputs_are_none():
    for bad in (None, "", "not a date", 12345):
        assert utc_hour(bad) is None
        assert utc_hour_key(bad) is None


def test_hour_key_zero_padded():
    assert utc_hour_key(datetime(2024, 1, 15, 8, 0)) == "08"
    assert utc_hour_key("2024-01-15T21:00:00Z") == "21"
