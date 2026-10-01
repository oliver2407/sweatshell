"""
Weather forecast, and the decisions we make from it.

The sheet comes up for four reasons, and the forecast can see three of them coming:

| Reason                                   | How often       | From the forecast        |
|------------------------------------------|-----------------|--------------------------|
| Storm, hail or wind that could tear it   | A few times/yr  | `protect_warning`        |
| End of the hot season: dry it and store  | Once a year     | `season_over`            |
| Upkeep: spray, check, rinse              | Every few months| `service_day` picks a dry, calm day |
| Cold season, sun wanted on the roof      | Once a year     | Not in this build        |

The forecast comes from Open-Meteo: free, no API key, hourly gusts and weather codes
for a week and daily figures for sixteen days. Hourly matters. Melbourne gusts pass
40 km/h on most spring days, usually for a few hours in the afternoon; deciding from
the daily maximum would keep the sheet rolled up nearly every day, and rolling it up
at midnight for a gust at 4pm throws away a morning of cooling.

If the network is down we fall back to the last good forecast and then to a bundled
sample, and we say which one the app is looking at. A screen that goes blank because
an API timed out is worse than one that says the forecast is two hours old.
"""

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

API_URL = "https://api.open-meteo.com/v1/forecast"
CACHE_PATH = Path(__file__).parent / "forecast_cache.json"
REFRESH_S = 1800.0  # half an hour; the forecast does not change faster than that
RETRY_S = 300.0  # after a failed fetch, so a dead network does not stall every poll

# Melbourne by default. Set these to the roof's real location.
LOCATION = {"latitude": -37.81, "longitude": 144.96, "timezone": "Australia/Melbourne"}

FORECAST_DAYS = 16  # Open-Meteo's maximum; the daily figures are enough for the season
HOURLY_DAYS = 7  # past a week, hourly timing is not worth acting on

# Roll the sheet up when gusts are forecast above this.
#
# This is a placeholder and should be replaced with a number measured against the
# actual fabric and fixings. Retractable awnings commonly retract somewhere around
# 30 to 40 km/h, so 40 is a starting point, not a finding. A sheet that tears in a
# storm is a worse outcome than a hot afternoon.
DEFAULT_WIND_GUST_KMH = 40.0

# WMO weather codes, as Open-Meteo reports them.
THUNDER_CODES = {95}
HAIL_CODES = {96, 99}  # thunderstorm with slight / heavy hail

# Forecast timing is good to an hour or two, not to the minute, so the sheet comes up
# this far ahead of the first risky hour and is not called safe until this long after
# the last one.
LEAD_H = 2
CLEAR_H = 1
# Two risky stretches this close together are one event. Rolling out for a two-hour
# lull between squalls is wear on the motor for no cooling worth having.
MERGE_GAP_H = 3

# Below this forecast maximum, the sheet is not earning its keep. Used only to
# *suggest* packing up, never to act on its own.
SEASON_OVER_MAX_C = 22.0
SEASON_OVER_DAYS = 7

# A good day to service the sheet: the setting solution needs to soak in rather than
# wash off, and nobody should be on a roof in a gale. Assumptions, not measurements.
SERVICE_MAX_RAIN_MM = 0.5
SERVICE_MAX_GUST_KMH = 30.0
SERVICE_LOOKAHEAD_DAYS = 14  # only start suggesting a day this close to the due date

_cache: dict | None = None
_fetched_at: float = 0.0


def _tz() -> ZoneInfo:
    return ZoneInfo(LOCATION["timezone"])


def _local_date(ts: float) -> str:
    return datetime.fromtimestamp(ts, _tz()).strftime("%Y-%m-%d")


def _sample(now: float) -> dict:
    """
    Shipped so the app has something to draw when there is no network at all.

    Built around the current time so it always has a future in it, and marked as a
    sample everywhere it is used so nobody mistakes it for a real forecast. Tomorrow
    afternoon carries a gust so the warning path is visible offline.
    """
    midnight = datetime.fromtimestamp(now, _tz()).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    maxes = [31.0, 34.0, 24.0, 21.0, 26.0]
    rains = [0.0, 0.0, 11.0, 4.0, 0.0]
    days, hours = [], []
    for i, (max_c, rain) in enumerate(zip(maxes, rains)):
        day = midnight + timedelta(days=i)
        day_gusts = []
        for h in range(24):
            gust = 52.0 if i == 1 and 14 <= h < 18 else 18.0 + (h % 12)
            day_gusts.append(gust)
            hours.append(
                {
                    "ts": (day + timedelta(hours=h)).timestamp(),
                    "gust_kmh": gust,
                    "code": 3,
                    "rain_mm": rain / 24,
                }
            )
        days.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "max_c": max_c,
                "gust_kmh": max(day_gusts),
                "rain_mm": rain,
                "code": 3,
            }
        )
    return {"source": "sample", "fetched_at": None, "days": days, "hours": hours}


def parse(payload: dict) -> dict:
    """Open-Meteo's column-per-field JSON into one record per day and per hour."""
    d, h = payload["daily"], payload["hourly"]
    days = [
        {
            "date": _local_date(d["time"][i]),
            "max_c": d["temperature_2m_max"][i],
            "gust_kmh": d["wind_gusts_10m_max"][i],
            "rain_mm": d["precipitation_sum"][i],
            "code": d["weather_code"][i],
        }
        for i in range(len(d["time"]))
    ]
    hours = [
        {
            "ts": h["time"][i],
            "gust_kmh": h["wind_gusts_10m"][i],
            "code": h["weather_code"][i],
            "rain_mm": h["precipitation"][i],
        }
        for i in range(min(len(h["time"]), HOURLY_DAYS * 24))
    ]
    return {"source": "live", "fetched_at": time.time(), "days": days, "hours": hours}


def _load_cache() -> dict | None:
    try:
        data = json.loads(CACHE_PATH.read_text())
    except Exception:
        return None
    # A cache written before hourly data existed cannot answer "when", so ignore it.
    return data if "hours" in data else None


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

    now = time.time()
    wait = REFRESH_S if _cache and _cache["source"] == "live" else RETRY_S
    if _cache and not force and now - _fetched_at < wait:
        return _cache

    try:
        r = httpx.get(
            API_URL,
            params={
                **LOCATION,
                "hourly": "wind_gusts_10m,weather_code,precipitation",
                "daily": "temperature_2m_max,wind_gusts_10m_max,precipitation_sum,"
                "weather_code",
                "forecast_days": FORECAST_DAYS,
                "timeformat": "unixtime",
                "wind_speed_unit": "kmh",
            },
            timeout=6.0,
        )
        r.raise_for_status()
        out = parse(r.json())
        _save_cache(out)
    except Exception:
        stored = _cache or _load_cache()
        out = {**stored, "source": "cache"} if stored else _sample(now)

    _cache, _fetched_at = out, now
    return out


def _hazard(hour: dict, gust_limit: float) -> set[str]:
    kinds = set()
    if hour.get("code") in HAIL_CODES:
        kinds.add("hail")
    elif hour.get("code") in THUNDER_CODES:
        kinds.add("storm")
    if hour.get("gust_kmh") is not None and hour["gust_kmh"] >= gust_limit:
        kinds.add("wind")
    return kinds


def _reason(kinds: set[str], peak_gust: float | None) -> str:
    parts = []
    if "hail" in kinds:
        parts.append("Hail")
    elif "storm" in kinds:
        parts.append("Thunderstorms")
    if "wind" in kinds and peak_gust is not None:
        gusts = f"gusts to {peak_gust:.0f} km/h"
        parts.append(gusts if parts else gusts.capitalize())
    return " and ".join(parts) + " forecast"


def risk_windows(forecast: dict, gust_limit: float, now: float | None = None) -> list:
    """
    Every upcoming stretch of weather that could damage the sheet, in order.

    Each window carries when it starts and ends, when the sheet should be up by, and
    when it is safe to roll out again. A window is kept until it is safe to roll out,
    not just until the weather stops: "keep it up until 7pm" is still a warning.
    """
    now = time.time() if now is None else now
    windows: list[dict] = []
    for hour in forecast.get("hours", []):
        end = hour["ts"] + 3600
        if end + CLEAR_H * 3600 <= now:
            continue
        kinds = _hazard(hour, gust_limit)
        if not kinds:
            continue
        last = windows[-1] if windows else None
        if last and hour["ts"] - last["end"] <= MERGE_GAP_H * 3600:
            last["end"] = end
            last["kinds"] |= kinds
            if hour.get("gust_kmh") is not None:
                last["peak_gust_kmh"] = max(last["peak_gust_kmh"] or 0, hour["gust_kmh"])
        else:
            windows.append(
                {
                    "start": hour["ts"],
                    "end": end,
                    "kinds": kinds,
                    "peak_gust_kmh": hour.get("gust_kmh"),
                }
            )

    return [
        {
            "date": _local_date(w["start"]),
            "start": w["start"],
            "end": w["end"],
            "roll_up_by": w["start"] - LEAD_H * 3600,
            "safe_after": w["end"] + CLEAR_H * 3600,
            "kinds": sorted(w["kinds"]),
            "peak_gust_kmh": w["peak_gust_kmh"],
            "reason": _reason(w["kinds"], w["peak_gust_kmh"]),
        }
        for w in windows
    ]


def protect_warning(forecast: dict, gust_limit: float, now: float | None = None):
    """
    The next stretch of weather that would put the sheet at risk, or None.

    Returned so the app can warn *before* it happens rather than reporting it
    afterwards. Being told at 6am that the sheet should be up by 2pm is useful; being
    told at 4pm that it already tore is just a log entry.
    """
    windows = risk_windows(forecast, gust_limit, now)
    return windows[0] if windows else None


def in_risk(forecast: dict, gust_limit: float, now: float | None = None):
    """The window the sheet should be up for right now, if there is one."""
    now = time.time() if now is None else now
    for w in risk_windows(forecast, gust_limit, now):
        if w["roll_up_by"] <= now < w["safe_after"]:
            return w
    return None


def _is_autumn(now: float) -> bool:
    month = datetime.fromtimestamp(now, _tz()).month
    southern = LOCATION["latitude"] < 0
    return month in ((3, 4, 5) if southern else (9, 10, 11))


def season_over(forecast: dict, now: float | None = None) -> bool:
    """
    True when the next week is mild enough that drying and storing the sheet is
    reasonable.

    Only in autumn. A mild week in spring is the season not having started yet, and
    telling someone to pack up in October would be wrong in Melbourne.
    """
    now = time.time() if now is None else now
    if not _is_autumn(now):
        return False
    days = [d for d in forecast.get("days", []) if d.get("max_c") is not None]
    if len(days) < SEASON_OVER_DAYS:
        return False
    return all(d["max_c"] < SEASON_OVER_MAX_C for d in days[:SEASON_OVER_DAYS])


def service_day(forecast: dict, days_until_due: float, now: float | None = None):
    """
    The first dry, calm day for upkeep, once upkeep is close to due.

    Starts from today when the service is overdue, and never suggests a day past
    the forecast's reach. None means nothing suitable in sight, not "do it never".
    """
    now = time.time() if now is None else now
    if days_until_due > SERVICE_LOOKAHEAD_DAYS:
        return None
    today = _local_date(now)
    for d in forecast.get("days", []):
        if d["date"] < today or d.get("rain_mm") is None or d.get("gust_kmh") is None:
            continue
        if d["rain_mm"] <= SERVICE_MAX_RAIN_MM and d["gust_kmh"] <= SERVICE_MAX_GUST_KMH:
            return {
                "date": d["date"],
                "reason": f"Dry, gusts under {d['gust_kmh']:.0f} km/h",
            }
    return None
