"""
Weather forecast, and the decisions we make from it.

Two jobs. Tell the app what tomorrow looks like, and decide whether the sheet
should be rolled up to protect it.

The forecast comes from Open-Meteo: free, no API key, and it carries wind gusts,
which is the number that actually matters here. If the network is down, or the
machine running this has no route out, we fall back to the last good forecast and
then to a bundled sample, and we say which one the app is looking at. A screen that
goes blank because an API timed out is worse than a screen that says the forecast is
two hours old.
"""

import json
import time
from pathlib import Path

import httpx

CACHE_PATH = Path(__file__).parent / "forecast_cache.json"
REFRESH_S = 1800.0  # half an hour; the forecast does not change faster than that

# Melbourne by default. Set these to the roof's real location.
LOCATION = {"latitude": -37.81, "longitude": 144.96, "timezone": "Australia/Melbourne"}

# Roll the sheet up when gusts are forecast above this.
#
# This is a placeholder and should be replaced with a number measured against the
# actual fabric and fixings. Retractable awnings commonly retract somewhere around
# 30 to 40 km/h, so 40 is a starting point, not a finding. A sheet that tears in a
# storm is a worse outcome than a hot afternoon.
DEFAULT_WIND_GUST_KMH = 40.0

# Below this forecast maximum, the sheet is not earning its keep and the season is
# probably over. Used only to *suggest* packing up, never to act on its own.
SEASON_OVER_MAX_C = 22.0
SEASON_OVER_DAYS = 5

_cache: dict | None = None
_fetched_at: float = 0.0

# Shipped so the app has something to draw when there is no network at all. Marked
# as a sample everywhere it is used, so nobody mistakes it for a real forecast.
SAMPLE = {
    "source": "sample",
    "days": [
        {"date": "2026-09-29", "max_c": 31.0, "gust_kmh": 22.0, "rain_mm": 0.0},
        {"date": "2026-09-30", "max_c": 34.0, "gust_kmh": 28.0, "rain_mm": 0.0},
        {"date": "2026-10-01", "max_c": 24.0, "gust_kmh": 52.0, "rain_mm": 11.0},
        {"date": "2026-10-02", "max_c": 21.0, "gust_kmh": 31.0, "rain_mm": 4.0},
        {"date": "2026-10-03", "max_c": 26.0, "gust_kmh": 18.0, "rain_mm": 0.0},
    ],
}


def _load_cache() -> dict | None:
    try:
        return json.loads(CACHE_PATH.read_text())
    except Exception:
        return None


def _save_cache(data: dict) -> None:
    try:
        CACHE_PATH.write_text(json.dumps(data))
    except Exception:
        pass  # a cache we cannot write is not worth failing a request over


def fetch(force: bool = False) -> dict:
    """
    Current forecast, with its provenance attached.

    `source` is one of "live", "cache" or "sample", and the app shows it. Never
    present a stale or sample forecast as though it were live.
    """
    global _cache, _fetched_at

    fresh_enough = _cache and (time.time() - _fetched_at) < REFRESH_S
    if fresh_enough and not force:
        return _cache

    try:
        r = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                **LOCATION,
                "daily": "temperature_2m_max,wind_gusts_10m_max,precipitation_sum",
                "forecast_days": 5,
            },
            timeout=6.0,
        )
        r.raise_for_status()
        d = r.json()["daily"]
        out = {
            "source": "live",
            "fetched_at": time.time(),
            "days": [
                {
                    "date": d["time"][i],
                    "max_c": d["temperature_2m_max"][i],
                    "gust_kmh": d["wind_gusts_10m_max"][i],
                    "rain_mm": d["precipitation_sum"][i],
                }
                for i in range(len(d["time"]))
            ],
        }
        _cache, _fetched_at = out, time.time()
        _save_cache(out)
        return out
    except Exception:
        stored = _cache or _load_cache()
        if stored:
            aged = {**stored, "source": "cache"}
            _cache = aged
            return aged
        return SAMPLE


def protect_warning(forecast: dict, gust_limit: float) -> dict | None:
    """
    The first forecast day whose gusts would put the sheet at risk.

    Returned so the app can warn *before* it happens rather than reporting it
    afterwards. Being told at 6am that the sheet will roll up on Thursday is useful;
    being told on Thursday that it already did is just a log entry.
    """
    for day in forecast.get("days", []):
        if day.get("gust_kmh") is not None and day["gust_kmh"] >= gust_limit:
            return {
                "date": day["date"],
                "gust_kmh": day["gust_kmh"],
                "reason": f"Gusts to {day['gust_kmh']:.0f} km/h forecast",
            }
    return None


def season_over(forecast: dict) -> bool:
    """True when the next few days are all mild enough that packing up is reasonable."""
    days = [d for d in forecast.get("days", []) if d.get("max_c") is not None]
    if len(days) < SEASON_OVER_DAYS:
        return False
    return all(d["max_c"] < SEASON_OVER_MAX_C for d in days[:SEASON_OVER_DAYS])
