"""
Forecast decisions, tested offline against payloads shaped like Open-Meteo's.

The one test that touches the network is marked `live` and skips itself when there
is no route out, so the suite passes on a plane.
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

import forecast

TZ = ZoneInfo("Australia/Melbourne")
H = 3600


def at(y, mo, d, h=0):
    return datetime(y, mo, d, h, tzinfo=TZ).timestamp()


# 6am, Friday 2 October 2026 in Melbourne: spring, not autumn.
NOW = at(2026, 10, 2, 6)
MIDNIGHT = at(2026, 10, 2)


def payload(gusts=None, codes=None, days=7, max_c=25.0, day_gust=20.0, rain=0.0):
    """An Open-Meteo response. `gusts` / `codes` override single hours by index."""
    n = days * 24
    g = [20.0] * n
    c = [3] * n
    for i, v in (gusts or {}).items():
        g[i] = v
    for i, v in (codes or {}).items():
        c[i] = v
    return {
        "hourly": {
            "time": [MIDNIGHT + i * H for i in range(n)],
            "wind_gusts_10m": g,
            "weather_code": c,
            "precipitation": [0.0] * n,
        },
        "daily": {
            "time": [MIDNIGHT + i * 24 * H for i in range(days)],
            "temperature_2m_max": [max_c] * days,
            "wind_gusts_10m_max": [day_gust] * days,
            "precipitation_sum": [rain] * days,
            "weather_code": [3] * days,
        },
    }


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    """No shared cache between tests, and never the real cache file."""
    monkeypatch.setattr(forecast, "_cache", None)
    monkeypatch.setattr(forecast, "_fetched_at", 0.0)
    monkeypatch.setattr(forecast, "CACHE_PATH", tmp_path / "cache.json")


# --- parsing ----------------------------------------------------------------


def test_parse_dates_are_local_to_the_roof():
    fc = forecast.parse(payload())
    assert fc["source"] == "live"
    assert fc["days"][0]["date"] == "2026-10-02"
    assert len(fc["hours"]) == 7 * 24


def test_parse_keeps_only_a_week_of_hours():
    fc = forecast.parse(payload(days=16))
    assert len(fc["days"]) == 16
    assert len(fc["hours"]) == forecast.HOURLY_DAYS * 24


# --- when to roll up --------------------------------------------------------


def test_calm_week_has_no_warning():
    fc = forecast.parse(payload())
    assert forecast.protect_warning(fc, 40, NOW) is None


def test_afternoon_gust_gives_a_window_not_a_whole_day():
    # Gusts 2pm–5pm today.
    fc = forecast.parse(payload(gusts={14: 45, 15: 52, 16: 48}))
    w = forecast.protect_warning(fc, 40, NOW)
    assert w["start"] == at(2026, 10, 2, 14)
    assert w["end"] == at(2026, 10, 2, 17)
    assert w["roll_up_by"] == at(2026, 10, 2, 12)
    assert w["safe_after"] == at(2026, 10, 2, 18)
    assert w["peak_gust_kmh"] == 52
    assert w["reason"] == "Gusts to 52 km/h forecast"


def test_gust_at_threshold_counts():
    fc = forecast.parse(payload(gusts={14: 40.0}))
    assert forecast.protect_warning(fc, 40, NOW) is not None


def test_short_lull_merges_into_one_event():
    # 2pm, then 5pm: a two-hour gap is one storm, not two roll-ups.
    fc = forecast.parse(payload(gusts={14: 50, 17: 50}))
    windows = forecast.risk_windows(fc, 40, NOW)
    assert len(windows) == 1
    assert windows[0]["end"] == at(2026, 10, 2, 18)


def test_long_gap_is_two_events():
    fc = forecast.parse(payload(gusts={10: 50, 20: 50}))
    assert len(forecast.risk_windows(fc, 40, NOW)) == 2


def test_hail_triggers_even_in_light_wind():
    fc = forecast.parse(payload(codes={24 + 15: 96}))  # tomorrow 3pm
    w = forecast.protect_warning(fc, 40, NOW)
    assert w["date"] == "2026-10-03"
    assert w["kinds"] == ["hail"]
    assert w["reason"] == "Hail forecast"


def test_storm_and_wind_are_named_together():
    fc = forecast.parse(payload(gusts={15: 61}, codes={15: 95}))
    w = forecast.protect_warning(fc, 40, NOW)
    assert w["reason"] == "Thunderstorms and gusts to 61 km/h forecast"


def test_weather_already_over_is_dropped():
    fc = forecast.parse(payload(gusts={2: 70, 30: 45}))  # 2am today has passed
    w = forecast.protect_warning(fc, 40, NOW)
    assert w["date"] == "2026-10-03"


def test_weather_under_way_is_still_a_warning():
    fc = forecast.parse(payload(gusts={5: 50, 6: 50, 7: 50}))
    w = forecast.protect_warning(fc, 40, NOW)
    assert w["start"] <= NOW < w["end"]


def test_threshold_is_respected():
    fc = forecast.parse(payload(gusts={14: 45}))
    assert forecast.protect_warning(fc, 50, NOW) is None


def test_in_risk_only_from_lead_time_until_clear():
    fc = forecast.parse(payload(gusts={14: 50}))  # window 2pm–3pm
    assert forecast.in_risk(fc, 40, at(2026, 10, 2, 11)) is None
    assert forecast.in_risk(fc, 40, at(2026, 10, 2, 12)) is not None
    assert forecast.in_risk(fc, 40, at(2026, 10, 2, 15) + 30 * 60) is not None
    assert forecast.in_risk(fc, 40, at(2026, 10, 2, 16)) is None


def test_warning_lasts_until_safe_not_until_the_gust_stops():
    fc = forecast.parse(payload(gusts={14: 50}))  # window 2pm–3pm, safe from 4pm
    w = forecast.protect_warning(fc, 40, at(2026, 10, 2, 15) + 30 * 60)
    assert w is not None and w["safe_after"] == at(2026, 10, 2, 16)


# --- end of season ----------------------------------------------------------


def test_mild_week_in_spring_is_not_end_of_season():
    fc = forecast.parse(payload(max_c=16.0))
    assert forecast.season_over(fc, NOW) is False


def test_mild_week_in_autumn_is_end_of_season():
    fc = forecast.parse(payload(max_c=16.0))
    assert forecast.season_over(fc, at(2026, 4, 20, 9)) is True


def test_one_warm_day_in_autumn_keeps_the_season_going():
    p = payload(max_c=16.0)
    p["daily"]["temperature_2m_max"][4] = 27.0
    assert forecast.season_over(forecast.parse(p), at(2026, 4, 20, 9)) is False


# --- a day for upkeep -------------------------------------------------------


def test_no_service_day_when_upkeep_is_far_off():
    fc = forecast.parse(payload())
    assert forecast.service_day(fc, 60, NOW) is None


def test_service_day_skips_wet_and_windy_days():
    p = payload()
    p["daily"]["precipitation_sum"][:3] = [8.0, 0.0, 0.0]
    p["daily"]["wind_gusts_10m_max"][:3] = [20.0, 55.0, 22.0]
    day = forecast.service_day(forecast.parse(p), 5, NOW)
    assert day["date"] == "2026-10-04"


def test_no_suitable_day_returns_none():
    fc = forecast.parse(payload(rain=5.0))
    assert forecast.service_day(fc, -3, NOW) is None


# --- fetching and fallbacks -------------------------------------------------


class FakeResponse:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self.data


def test_fetch_live_then_cached_in_memory(monkeypatch):
    calls = []

    def fake_get(url, params, timeout):
        calls.append(params)
        return FakeResponse(payload())

    monkeypatch.setattr(httpx, "get", fake_get)
    assert forecast.fetch()["source"] == "live"
    assert forecast.fetch()["source"] == "live"
    assert len(calls) == 1  # second call served from memory
    assert calls[0]["timeformat"] == "unixtime"
    assert "wind_gusts_10m" in calls[0]["hourly"]


def test_fetch_falls_back_to_disk_cache_and_says_so(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResponse(payload()))
    forecast.fetch()

    def offline(*a, **k):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx, "get", offline)
    monkeypatch.setattr(forecast, "_cache", None)  # as after a restart
    fc = forecast.fetch(force=True)
    assert fc["source"] == "cache"
    assert len(fc["hours"]) == 7 * 24


def test_fetch_with_nothing_falls_back_to_a_sample_with_a_future(monkeypatch):
    def offline(*a, **k):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx, "get", offline)
    fc = forecast.fetch()
    assert fc["source"] == "sample"
    w = forecast.protect_warning(fc, 40)
    assert w is not None and w["peak_gust_kmh"] == 52


def test_failed_fetch_is_not_retried_on_every_poll(monkeypatch):
    calls = []

    def offline(*a, **k):
        calls.append(1)
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx, "get", offline)
    forecast.fetch()
    forecast.fetch()
    forecast.fetch()
    assert len(calls) == 1


def test_old_cache_without_hours_is_ignored(monkeypatch):
    forecast.CACHE_PATH.write_text('{"source": "live", "days": []}')

    def offline(*a, **k):
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(httpx, "get", offline)
    assert forecast.fetch()["source"] == "sample"


# --- the real API -----------------------------------------------------------


@pytest.mark.live
def test_live_open_meteo():
    try:
        fc = forecast.fetch(force=True)
    except Exception as e:  # pragma: no cover
        pytest.skip(f"network: {e}")
    if fc["source"] != "live":
        pytest.skip("Open-Meteo not reachable from here")
    assert len(fc["days"]) >= 7
    assert len(fc["hours"]) == forecast.HOURLY_DAYS * 24
    first = fc["hours"][0]
    assert isinstance(first["ts"], (int, float))
    assert first["gust_kmh"] is None or 0 <= first["gust_kmh"] < 300
    # Whatever the weather, the decisions must run on real data without error.
    forecast.risk_windows(fc, forecast.DEFAULT_WIND_GUST_KMH)
    forecast.season_over(fc)
    forecast.service_day(fc, 0)
