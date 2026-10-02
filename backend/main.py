"""
SweatShell backend.

One FastAPI app. The ESP32 POSTs readings; the dashboard polls /api/state. No
WebSockets, no MQTT, no broker to babysit at a hackathon.
"""

import csv
import io
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import cooling
import db
import forecast

app = FastAPI(title="SweatShell API", version="0.1.0")

# The dashboard runs on a different port in dev, so it is a cross-origin caller.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BOXES = {
    "box1": "Bare metal",
    "box2": "Eggshell coat",
    "box3": "Eggshell + bio gel (SweatShell)",
    "box4": "Eggshell + wet cloth (control)",
}

# Everything below that a person can change is loaded from the database and written
# back whenever it changes, so a backend restart does not quietly hand them the
# factory defaults again. The transient things — a pending pump command, which
# schedule slot already fired today — stay in memory on purpose: they are about this
# run, not about this installation.

# Calibrate these against the real pad before the demo: weigh it soaking wet, then
# oven-dry it and weigh again. Guessing here makes the water gauge meaningless.
config = db.load_setting(
    "config",
    {
        "gel_full_mass_g": 300.0,  # pad + tray, fully saturated
        "gel_dry_mass_g": 120.0,  # pad + tray, bone dry
        "pump_threshold_pct": 30.0,  # water level that triggers a watering
        "pump_run_seconds": 5.0,
        "auto_pump": True,
    },
)

# Set when the dashboard or the auto rule asks for water; the ESP32 polls and clears it.
_pump_request: dict | None = None
_last_pump_at: float = 0.0

# The sheet is on a motorised roller. Same pattern as the pump: the app sets a
# request, the device polls and clears it, and the device reports back what it
# actually did. The app never assumes the motor obeyed.
#
# The roller's position is persisted too. It is physical state: if the backend
# restarts overnight while the sheet is rolled up, the app must not wake up
# claiming it is out over the roof.
_sheet_out: bool = db.load_setting("sheet", {"out": True})["out"]
_sheet_request: str | None = None  # "out" | "up" | None

# Daily schedule. The sheet's useful moves are slow and predictable — out in the
# morning, up in the evening — so a clock beats a thermostat here. A roof covering
# takes hours to change the temperature inside, which means reacting to an indoor
# reading is always too late; being out before the sun arrives is what works.
#
# A list of windows rather than one pair of times, because a day is not one shape.
# A west-facing roof wants the sheet out for the afternoon only; someone home at
# lunch wants a gap; a shoulder-season week wants it out three days in five. Each
# window carries its own days of the week and an optional date range, so "every
# afternoon in January" and "weekends until the end of the month" are both one row.
#
#   {"id": 1, "enabled": true, "out_at": "06:30", "up_at": "11:00",
#    "days": [0,1,2,3,4],            # 0 = Monday
#    "from": "2026-10-01", "to": null, "label": "Morning"}
#
def _window(wid: int, out_at: str, up_at: str, label: str) -> dict:
    return {
        "id": wid,
        "enabled": True,
        "out_at": out_at,
        "up_at": up_at,
        "days": [0, 1, 2, 3, 4, 5, 6],
        "from": None,
        "to": None,
        "label": label,
    }


def _load_schedule() -> dict:
    """
    Read the schedule, carrying an older single-pair one into the windows list.

    Loaded with an empty fallback on purpose. Merging the defaults in first would
    hand this function a `windows` key that the person never set, and the migration
    would see it, decide there was nothing to carry, and quietly throw away the
    times they had chosen.
    """
    stored = db.load_setting("schedule", {})

    if stored.get("windows"):
        stored.pop("roll_out_at", None)
        stored.pop("roll_up_at", None)
        return {"enabled": stored.get("enabled", False), "windows": stored["windows"]}

    if stored.get("roll_out_at") or stored.get("roll_up_at"):
        migrated = {
            "enabled": stored.get("enabled", False),
            "windows": [
                _window(
                    1,
                    stored.get("roll_out_at", "08:00"),
                    stored.get("roll_up_at", "19:00"),
                    "All day",
                )
            ],
        }
        db.save_setting("schedule", migrated)
        return migrated

    return {"enabled": False, "windows": [_window(1, "08:00", "19:00", "All day")]}


schedule = _load_schedule()

# What the schedule wanted the sheet to be, last time we looked. We act on the
# CHANGE, not on the state, so that rolling the sheet up by hand at noon is not
# undone two seconds later by a window that is still open. A manual decision stands
# until the next boundary the schedule crosses.
_last_desired: bool | None = None

# Protective auto roll-up, driven by the forecast rather than by a sensor. A wind
# gust that could tear the sheet has to be acted on before it arrives, and nothing
# on the roof can see it coming.
protect = db.load_setting(
    "protect",
    {
        "enabled": True,
        "auto": False,  # False = warn the person and let them press the button
        "wind_gust_kmh": forecast.DEFAULT_WIND_GUST_KMH,
    },
)
_protect_fired_for: float | None = None  # start of the risk window we acted on

# Maintenance. The gel softens over months and wants one spray of the setting
# solution to firm up again.
maintenance = db.load_setting(
    "maintenance",
    {
        "installed_at": time.time(),
        "last_service_at": time.time(),
        "interval_days": 90,
    },
)
# First run only: fix the install date so it is not re-stamped on every boot.
db.save_setting("maintenance", maintenance)

# Guards against a noisy load cell hammering the pump.
#
# Hysteresis does the real work: once we have watered, we refuse to auto-water
# again until the level has climbed clear of the threshold. A wall-clock cooldown
# alone is not enough, because the simulator's --fast mode compresses hours of
# drying into seconds and would starve the gel while the clock ticked.
# Hysteresis is the guard that matters: after watering we will not auto-water
# again until the level has climbed 15 points clear of the threshold, so a scale
# wobbling around 30% cannot cause a pump loop.
PUMP_HYSTERESIS_PCT = 15.0
# The wall-clock gap only stops two readings arriving in the same instant from
# double-firing. Keep it tiny: anything longer starves the gel under --fast,
# where 20 simulated minutes of drying pass in half a real second.
PUMP_MIN_GAP_S = 0.5
_pump_armed = True  # False after watering, re-arms once the gel is wet again

# How long without a reading before we stop believing the last one. Pump and roller
# flags in a stale reading are a frozen snapshot, and treating them as live leaves
# the app stuck on "Watering…" with its buttons disabled.
STALE_AFTER_S = 45.0


class Reading(BaseModel):
    """What the ESP32 posts. Any probe may be null if that sensor dropped out."""

    roof: dict[str, float | None] = Field(default_factory=dict)
    inside: dict[str, float | None] = Field(default_factory=dict)
    gel_mass_g: float | None = None
    ambient_c: float | None = None
    humidity: float | None = None
    pump_on: bool = False
    sheet_out: bool | None = None  # what the roller actually did, not what we asked
    ts: float | None = None  # lets the simulator and buffered uploads backdate


class SessionStart(BaseModel):
    label: str
    notes: str | None = None


class ConfigPatch(BaseModel):
    gel_full_mass_g: float | None = None
    gel_dry_mass_g: float | None = None
    pump_threshold_pct: float | None = None
    pump_run_seconds: float | None = None
    auto_pump: bool | None = None


class ScaleQuery(BaseModel):
    """Inputs for the 'would this work on a real roof' calculator."""

    roof_area_m2: float = 30.0
    tank_litres: float = 5000.0
    hot_days_per_year: int = 10
    hours_per_hot_day: float = 8.0


def water_percent(mass_g: float | None) -> float | None:
    if mass_g is None:
        return None
    span = config["gel_full_mass_g"] - config["gel_dry_mass_g"]
    if span <= 0:
        return None
    pct = (mass_g - config["gel_dry_mass_g"]) / span * 100.0
    return round(max(0.0, min(100.0, pct)), 1)


def grams_evaporated(readings: list[dict]) -> float:
    """
    Cumulative water lost across a run.

    Only counts mass DECREASES. A refill makes the mass jump up, and counting that
    as evaporation would inflate the cooling number every time the pump fires.
    """
    total = 0.0
    prev = None
    for r in readings:
        m = r.get("gel_mass_g")
        if m is None:
            continue
        if prev is not None and m < prev:
            total += prev - m
        prev = m
    return round(total, 2)


def mean_inside(readings: list[dict], box: str) -> float | None:
    vals = [r["inside"].get(box) for r in readings if r["inside"].get(box) is not None]
    return sum(vals) / len(vals) if vals else None


@app.get("/api/health")
def health():
    return {"ok": True, "ts": time.time()}


@app.get("/api/assumptions")
def assumptions():
    """Surfaced in the UI so nobody has to take the cooling number on faith."""
    return cooling.ASSUMPTIONS


@app.get("/api/config")
def get_config():
    return {**config, "boxes": BOXES}


@app.patch("/api/config")
def patch_config(patch: ConfigPatch):
    for k, v in patch.model_dump(exclude_none=True).items():
        config[k] = v
    db.save_setting("config", config)
    db.log_event("config", f"Config updated: {patch.model_dump(exclude_none=True)}")
    return {**config, "boxes": BOXES}


@app.post("/api/reading")
def post_reading(reading: Reading):
    global _pump_request, _last_pump_at, _pump_armed, _sheet_out

    session = db.active_session()
    session_id = session["id"] if session else None

    if reading.sheet_out is not None and reading.sheet_out != _sheet_out:
        # Only on a change: the roller reports its position with every reading, and
        # writing that to disk a few times a minute forever would be pointless.
        _sheet_out = reading.sheet_out
        db.save_setting("sheet", {"out": _sheet_out})

    # Incoming readings are the system's heartbeat, so the clock and the forecast get
    # checked here rather than on a background thread. One less thing to keep alive.
    tick_schedule()
    tick_protect()

    db.insert_reading(
        roof=reading.roof,
        inside=reading.inside,
        gel_mass_g=reading.gel_mass_g,
        ambient_c=reading.ambient_c,
        humidity=reading.humidity,
        pump_on=reading.pump_on,
        session_id=session_id,
        ts=reading.ts,
        sheet_out=_sheet_out,
    )

    pct = water_percent(reading.gel_mass_g)
    now = time.time()
    threshold = config["pump_threshold_pct"]

    if pct is not None:
        # Re-arm once the gel is comfortably wet again.
        if pct >= threshold + PUMP_HYSTERESIS_PCT:
            _pump_armed = True

        if (
            config["auto_pump"]
            and _pump_armed
            and pct < threshold
            and _pump_request is None
            and now - _last_pump_at > PUMP_MIN_GAP_S
        ):
            _pump_request = {"seconds": config["pump_run_seconds"], "requested_at": now}
            _last_pump_at = now
            _pump_armed = False
            db.log_event(
                "pump",
                f"Gel dropped to {pct}% — pump requested for "
                f"{config['pump_run_seconds']:.0f}s",
                session_id,
            )

    return {"ok": True, "water_pct": pct, "pump_queued": _pump_request is not None}


@app.get("/api/pump/command")
def pump_command():
    """
    The ESP32 polls this. Returning the command and clearing it in one call keeps
    the device dumb: no retained MQTT topic, no missed message on reconnect.
    """
    global _pump_request
    cmd = _pump_request
    _pump_request = None
    return {"pump": bool(cmd), "seconds": cmd["seconds"] if cmd else 0}


@app.post("/api/pump")
def request_pump(seconds: float | None = None):
    """
    Manual watering. This button exists so the demo does not depend on the gel
    happening to dry out while a judge is watching.
    """
    global _pump_request, _last_pump_at
    _pump_request = {
        "seconds": seconds or config["pump_run_seconds"],
        "requested_at": time.time(),
    }
    _last_pump_at = time.time()
    session = db.active_session()
    db.log_event(
        "pump",
        f"Manual watering requested ({_pump_request['seconds']:.0f}s)",
        session["id"] if session else None,
    )
    return {"ok": True, **_pump_request}


def _queue_sheet(move: str, why: str) -> None:
    global _sheet_request
    _sheet_request = move
    session = db.active_session()
    db.log_event("sheet", why, session["id"] if session else None)


def window_applies_today(w: dict, now: time.struct_time) -> bool:
    """Does this window run on today's date at all?"""
    if not w.get("enabled", True):
        return False
    if now.tm_wday not in w.get("days", [0, 1, 2, 3, 4, 5, 6]):
        return False
    today = time.strftime("%Y-%m-%d", now)
    # A window can be given a start and an end date, which is how "just for this
    # month" or "only over summer" is expressed without anyone having to remember
    # to turn it off.
    if w.get("from") and today < w["from"]:
        return False
    if w.get("to") and today > w["to"]:
        return False
    return True


def active_window(now: time.struct_time | None = None) -> dict | None:
    """The first window whose hours cover right now, or None."""
    now = now or time.localtime()
    hhmm = time.strftime("%H:%M", now)
    for w in schedule.get("windows", []):
        if not window_applies_today(w, now):
            continue
        out_at, up_at = w["out_at"], w["up_at"]
        covered = (
            out_at <= hhmm < up_at
            if out_at <= up_at
            # A window that ends before it starts runs through midnight, which is
            # what someone asking for the sheet out overnight actually means.
            else hhmm >= out_at or hhmm < up_at
        )
        if covered:
            return w
    return None


def desired_sheet_state(now: time.struct_time | None = None) -> bool | None:
    """
    True if the schedule wants the sheet out, False if up, None if it has no opinion.

    None happens when the schedule is off entirely, or when today has no windows at
    all — on a day nobody scheduled, the sheet stays wherever it was put.
    """
    if not schedule.get("enabled"):
        return None
    now = now or time.localtime()
    todays = [w for w in schedule.get("windows", []) if window_applies_today(w, now)]
    if not todays:
        return None
    return active_window(now) is not None


def tick_schedule() -> None:
    """
    Move the sheet when the schedule's intent changes.

    Edge-triggered on purpose. Acting on the state every tick would mean rolling the
    sheet up by hand at noon got silently undone three seconds later, which is worse
    than no schedule at all. Acting on the change means a manual decision stands
    until the schedule next crosses a boundary of its own.
    """
    global _last_desired

    want_out = desired_sheet_state()
    if want_out is None:
        _last_desired = None
        return

    first_look = _last_desired is None
    changed = want_out != _last_desired
    _last_desired = want_out

    # On the first tick after a restart we align the sheet with the schedule, since
    # the backend may have been down across a boundary. After that, only changes.
    if not changed and not first_look:
        return
    if _sheet_out == want_out:
        return

    w = active_window() or {}
    at = w.get("out_at" if want_out else "up_at", "")
    label = w.get("label") or "Schedule"

    # The clock does not know a storm is coming. When the person has turned on
    # rolling up in rough weather, the schedule must not undo it by rolling out into
    # the same storm. With it off, the forecast only warns and never changes what
    # the sheet does.
    if want_out and protect["enabled"] and protect["auto"]:
        risk = forecast.in_risk(forecast.fetch(), protect["wind_gust_kmh"])
        if risk:
            db.log_event("schedule", f"Scheduled roll-out skipped — {risk['reason']}")
            return

    _queue_sheet(
        "out" if want_out else "up",
        f"{label}: rolling {'out' if want_out else 'up'}{f' at {at}' if at else ''}",
    )


def tick_protect() -> None:
    """
    Roll the sheet up ahead of weather that could tear it.

    Only acts on its own when the person has turned that on. Otherwise it warns and
    waits: an unexpected motor movement on someone's roof is not a good surprise, and
    a forecast can be wrong.
    """
    global _protect_fired_for
    if not protect["enabled"] or not protect["auto"]:
        return
    # Act from a couple of hours before the weather, not from midnight that day: a
    # gust at 4pm is no reason to give up a morning of cooling.
    risk = forecast.in_risk(forecast.fetch(), protect["wind_gust_kmh"])
    if not risk or _protect_fired_for == risk["start"]:
        return
    # Once per window, so a person who rolls it back out on purpose is not overruled
    # on every reading.
    _protect_fired_for = risk["start"]
    if _sheet_out:
        _queue_sheet("up", f"Rolled up to protect the sheet — {risk['reason']}")


@app.get("/api/sheet/command")
def sheet_command():
    """The roller polls this. Returns the pending move and clears it."""
    global _sheet_request
    cmd = _sheet_request
    _sheet_request = None
    return {"move": cmd}


@app.post("/api/sheet")
def move_sheet(out: bool):
    global _sheet_request
    _sheet_request = "out" if out else "up"
    session = db.active_session()
    db.log_event(
        "sheet",
        "Rolling the sheet out" if out else "Rolling the sheet up",
        session["id"] if session else None,
    )
    return {"ok": True, "move": _sheet_request}


class SchedulePatch(BaseModel):
    """Turns the whole schedule on or off. Windows are edited one at a time."""

    enabled: bool | None = None


class WindowPatch(BaseModel):
    enabled: bool | None = None
    out_at: str | None = None  # "HH:MM", 24-hour
    up_at: str | None = None
    days: list[int] | None = None  # 0 = Monday
    label: str | None = None
    # Explicit nulls have to be distinguishable from "not sent" here, because
    # clearing an end date is a thing someone does. Sending "" means clear.
    date_from: str | None = None
    date_to: str | None = None


class ProtectPatch(BaseModel):
    enabled: bool | None = None
    auto: bool | None = None
    wind_gust_kmh: float | None = None


def maintenance_state(fc: dict | None = None) -> dict:
    """
    Days in service, how long until the gel wants its next spray, and once that is
    close, the first dry, calm day in the forecast to do it on.
    """
    now = time.time()
    day = 86400.0
    due_at = maintenance["last_service_at"] + maintenance["interval_days"] * day
    days_left = (due_at - now) / day
    elapsed = maintenance["interval_days"] - days_left
    return {
        "days_in_service": int((now - maintenance["installed_at"]) / day),
        "days_until_service": int(days_left),
        "interval_days": maintenance["interval_days"],
        "progress": max(0.0, min(1.0, elapsed / maintenance["interval_days"])),
        "overdue": days_left < 0,
        "task": "Spray the setting solution once to firm the gel up again.",
        "good_day": forecast.service_day(fc, days_left) if fc else None,
    }


@app.get("/api/home")
def home():
    """
    What the phone app shows. Deliberately narrow.

    /api/state exists for the bench and returns everything: per-box readings, the
    energy chain, the assumptions behind it. A person checking their roof on the
    train does not need any of that, and every extra number on that screen is a
    question they have to answer for themselves. This endpoint returns what someone
    living with the product needs to decide something: how warm is it inside, does
    the sheet need water, where is the sheet, and is anything coming that they
    should know about.
    """
    latest = db.latest_reading(resolve_scope(None))
    if not latest:
        return {"ready": False, "message": "Not connected to your roof yet."}

    # If the roof stopped reporting, every "is the pump running" flag in that last
    # reading is a frozen snapshot, not the truth. Saying so lets the app stop
    # showing "Watering…" forever and stop disabling the buttons behind it.
    age_s = time.time() - latest["ts"]
    stale = age_s > STALE_AFTER_S

    inside_c = latest["inside"].get("box3")
    pct = water_percent(latest["gel_mass_g"])
    scope = resolve_scope(None)
    readings = db.session_readings(scope) if scope is not None else []
    grams = grams_evaporated(readings)

    fc = forecast.fetch()
    warn = (
        forecast.protect_warning(fc, protect["wind_gust_kmh"])
        if protect["enabled"]
        else None
    )

    # Plain-language health. One line, one action, never a stack trace.
    if stale:
        status, advice = (
            "unknown",
            f"No reading for {int(age_s // 60)} minutes. Check the roof unit has "
            "power and wifi.",
        )
    elif pct is None:
        # The temperature probes can be fine while the load cell is not. Naming the
        # wrong part sends someone to check the wrong wire, which is worse than
        # saying nothing.
        status, advice = (
            "unknown",
            "Temperatures are coming through, but the scale under the gel is not "
            "reporting, so there is no water reading.",
        )
    elif not _sheet_out:
        status, advice = "parked", "The sheet is rolled up. Roll it out to start cooling."
    elif pct < 20:
        status, advice = "dry", "The sheet is dry and has stopped cooling. Water it now."
    elif pct < 40:
        status, advice = "low", "Running low. It will water itself shortly."
    else:
        status, advice = "good", "Cooling normally. Nothing to do."

    return {
        "ready": True,
        "ts": latest["ts"],
        "stale": stale,
        "inside_c": inside_c,
        "inside_humidity": latest["humidity"],
        "outside_c": latest["ambient_c"],
        "water_pct": pct,
        "litres_used": round(grams / 1000.0, 1),
        "sheet_out": _sheet_out,
        "sheet_moving": _sheet_request is not None and not stale,
        "pump_on": latest["pump_on"] and not stale,
        "pump_queued": _pump_request is not None and not stale,
        "auto_water": config["auto_pump"],
        "water_threshold_pct": config["pump_threshold_pct"],
        "status": status,
        "advice": advice,
        "schedule": schedule_state(),
        "protect": {
            **protect,
            "warning": warn,
            "forecast_source": fc.get("source"),
            "season_over": forecast.season_over(fc),
        },
        "maintenance": maintenance_state(fc),
    }


@app.get("/api/home/series")
def home_series(max_points: int = 160):
    """
    One line for the phone chart — the temperature inside — plus whether the sheet
    was out at each point, so the chart can shade the stretches when it was in use.

    The bench comparison lives on /api/series. Here a second line would only raise a
    question the screen is not there to answer.
    """
    scope = resolve_scope(None)
    readings = db.session_readings(scope) if scope is not None else []
    if len(readings) > max_points:
        step = len(readings) // max_points + 1
        readings = readings[::step]
    return [
        {
            "ts": r["ts"],
            "inside_c": r["inside"].get("box3"),
            "sheet_out": r["sheet_out"],
        }
        for r in readings
    ]


@app.get("/api/forecast")
def get_forecast():
    """The forecast with its provenance, and every risk window it implies."""
    fc = forecast.fetch()
    return {**fc, "risks": forecast.risk_windows(fc, protect["wind_gust_kmh"])}


@app.patch("/api/schedule")
def patch_schedule(p: SchedulePatch):
    global _last_desired
    for k, v in p.model_dump(exclude_none=True).items():
        schedule[k] = v
    db.save_setting("schedule", schedule)
    # Forget what the schedule wanted a moment ago, so the next tick treats this as
    # a first look and brings the sheet in line with the new rules straight away.
    _last_desired = None
    db.log_event(
        "schedule",
        f"Schedule turned {'on' if schedule['enabled'] else 'off'}",
    )
    return schedule_state()


def next_change(now: time.struct_time | None = None) -> dict | None:
    """
    The next moment the schedule will move the sheet, and which way.

    A button that says "Auto" and does nothing visible for six hours is a button
    nobody trusts. Handing the app the next move lets it say "rolling up at 8:00 pm"
    instead, which is the whole answer to what turning this on will do.

    Works by evaluating the schedule a minute after each boundary rather than
    reasoning about which window wins, so overlapping windows cannot trip it up.
    """
    now = now or time.localtime()
    current = desired_sheet_state(now)
    if current is None:
        return None

    start = time.mktime(now)
    candidates: list[float] = []
    for day_offset in range(8):
        day = time.localtime(start + day_offset * 86400)
        for w in schedule.get("windows", []):
            if not window_applies_today(w, day):
                continue
            for hhmm in (w["out_at"], w["up_at"]):
                try:
                    h, m = (int(x) for x in hhmm.split(":"))
                except ValueError:
                    continue
                t = time.mktime(
                    (day.tm_year, day.tm_mon, day.tm_mday, h, m, 0, 0, 0, -1)
                )
                if t > start:
                    candidates.append(t)

    for t in sorted(set(candidates)):
        # A minute past the boundary, so the comparison in active_window has
        # unambiguously crossed it.
        after = time.localtime(t + 60)
        state = desired_sheet_state(after)
        if state is not None and state != current:
            return {
                "at": time.strftime("%H:%M", time.localtime(t)),
                "epoch": t,
                "to": "out" if state else "up",
                "today": time.strftime("%Y-%m-%d", time.localtime(t))
                == time.strftime("%Y-%m-%d", now),
            }
    return None


def schedule_state() -> dict:
    """The schedule plus what it currently wants, which is what the app shows."""
    now = time.localtime()
    w = active_window(now)
    return {
        **schedule,
        "active_window_id": w["id"] if w else None,
        "wants_out": desired_sheet_state(now),
        "next_change": next_change(now),
    }


@app.post("/api/schedule/windows")
def add_window():
    """A new window, in the gap most people want next: an afternoon."""
    global _last_desired
    windows = schedule.setdefault("windows", [])
    new_id = max((w["id"] for w in windows), default=0) + 1
    w = {
        "id": new_id,
        "enabled": True,
        "out_at": "12:00",
        "up_at": "18:00",
        "days": [0, 1, 2, 3, 4, 5, 6],
        "from": None,
        "to": None,
        "label": "",
    }
    windows.append(w)
    db.save_setting("schedule", schedule)
    _last_desired = None
    return schedule_state()


@app.patch("/api/schedule/windows/{window_id}")
def patch_window(window_id: int, p: WindowPatch):
    global _last_desired
    w = next((x for x in schedule.get("windows", []) if x["id"] == window_id), None)
    if not w:
        raise HTTPException(404, "No such window")

    sent = p.model_dump(exclude_unset=True)
    for key, field in (("date_from", "from"), ("date_to", "to")):
        if key in sent:
            # Empty string is how the app says "no date", since a missing key means
            # "leave it alone" and the two must not be confused.
            w[field] = sent.pop(key) or None
    for k, v in sent.items():
        if v is not None:
            w[k] = v

    db.save_setting("schedule", schedule)
    _last_desired = None
    return schedule_state()


@app.delete("/api/schedule/windows/{window_id}")
def delete_window(window_id: int):
    global _last_desired
    before = len(schedule.get("windows", []))
    schedule["windows"] = [
        w for w in schedule.get("windows", []) if w["id"] != window_id
    ]
    if len(schedule["windows"]) == before:
        raise HTTPException(404, "No such window")
    db.save_setting("schedule", schedule)
    _last_desired = None
    return schedule_state()


@app.patch("/api/protect")
def patch_protect(p: ProtectPatch):
    for k, v in p.model_dump(exclude_none=True).items():
        protect[k] = v
    db.save_setting("protect", protect)
    return protect


@app.post("/api/maintenance/done")
def maintenance_done():
    """The person has just serviced the sheet. Reset the countdown."""
    maintenance["last_service_at"] = time.time()
    db.save_setting("maintenance", maintenance)
    db.log_event("maintenance", "Sheet serviced — countdown reset")
    return maintenance_state(forecast.fetch())


def resolve_scope(session_id: int | None) -> int | None:
    """
    Prefer the running session over a wall-clock window.

    Totals like hours-elapsed and litres per degree per hour are only meaningful
    across a whole run. Falling back to "last 15 minutes" made them read as ~0
    whenever the simulator ran compressed time.
    """
    if session_id is not None:
        return session_id
    active = db.active_session()
    return active["id"] if active else None


@app.get("/api/state")
def state(window: float = 900, session_id: int | None = None):
    """Everything the dashboard needs, in one request."""
    scope = resolve_scope(session_id)
    latest = db.latest_reading(scope)
    readings = (
        db.session_readings(scope) if scope is not None else db.readings_since(window)
    )

    if not latest:
        return {
            "ready": False,
            "boxes": BOXES,
            "config": config,
            "assumptions": cooling.ASSUMPTIONS,
            "message": "No readings yet. Start the simulator or power up the ESP32.",
        }

    grams = grams_evaporated(readings)
    span_hours = (
        (readings[-1]["ts"] - readings[0]["ts"]) / 3600.0 if len(readings) > 1 else 0.0
    )

    # The water cost is measured against the sweat delta specifically (gel vs
    # coat-only), because the reflective coat costs no water at all.
    mean2 = mean_inside(readings, "box2")
    mean3 = mean_inside(readings, "box3")
    sweat_delta_mean = (mean2 - mean3) if (mean2 is not None and mean3 is not None) else 0.0

    return {
        "ready": True,
        "ts": latest["ts"],
        "boxes": BOXES,
        "roof": latest["roof"],
        "inside": latest["inside"],
        "ambient_c": latest["ambient_c"],
        "humidity": latest["humidity"],
        "pump_on": latest["pump_on"],
        "pump_queued": _pump_request is not None,
        "gel_mass_g": latest["gel_mass_g"],
        "water_pct": water_percent(latest["gel_mass_g"]),
        "deltas": cooling.deltas(latest["inside"]),
        "totals": {
            "grams_evaporated": grams,
            "litres_evaporated": round(grams / 1000.0, 3),
            "heat_removed_kj": round(cooling.heat_removed_kj(grams), 1),
            "ac_kwh_saved": round(cooling.ac_electricity_saved_kwh(grams), 4),
            "co2_avoided_kg": round(cooling.co2_avoided_kg(grams), 4),
            "hours_elapsed": round(span_hours, 3),
            "litres_per_degree_per_hour": cooling.water_cost(
                grams, sweat_delta_mean, span_hours
            ),
            "mean_sweat_delta_c": round(sweat_delta_mean, 2),
        },
        "config": config,
        "assumptions": cooling.ASSUMPTIONS,
        "session": db.active_session(),
        "events": db.recent_events(25, scope),
        "sample_count": len(readings),
    }


@app.get("/api/series")
def series(window: float = 900, session_id: int | None = None, max_points: int = 400):
    """Time series for the chart, thinned so the browser is not asked to draw 10k points."""
    scope = resolve_scope(session_id)
    readings = (
        db.session_readings(scope) if scope is not None else db.readings_since(window)
    )
    if len(readings) > max_points:
        step = len(readings) // max_points + 1
        readings = readings[::step]

    return [
        {
            "ts": r["ts"],
            "roof": r["roof"],
            "inside": r["inside"],
            "ambient_c": r["ambient_c"],
            "humidity": r["humidity"],
            "gel_mass_g": r["gel_mass_g"],
            "water_pct": water_percent(r["gel_mass_g"]),
            "pump_on": r["pump_on"],
        }
        for r in readings
    ]


@app.get("/api/sessions")
def sessions():
    return db.list_sessions()


@app.post("/api/session/start")
def session_start(payload: SessionStart):
    s = db.start_session(payload.label, payload.notes)
    db.log_event("session", f"Run started: {payload.label}", s["id"])
    return s


@app.post("/api/session/{session_id}/stop")
def session_stop(session_id: int):
    s = db.stop_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    db.log_event("session", f"Run stopped: {s['label']}", session_id)
    return s


@app.get("/api/session/{session_id}/export.csv")
def export_csv(session_id: int):
    """
    CSV export. This is what turns a demo into evidence: a judge can take the raw
    numbers away and check them.
    """
    readings = db.session_readings(session_id)
    if not readings:
        raise HTTPException(404, "No readings for that session")

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "timestamp_iso",
            "epoch",
            *[f"roof_{b}_c" for b in BOXES],
            *[f"inside_{b}_c" for b in BOXES],
            "ambient_c",
            "humidity_pct",
            "gel_mass_g",
            "water_pct",
            "pump_on",
        ]
    )
    for r in readings:
        writer.writerow(
            [
                time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(r["ts"])),
                round(r["ts"], 2),
                *[r["roof"].get(b, "") for b in BOXES],
                *[r["inside"].get(b, "") for b in BOXES],
                r["ambient_c"] if r["ambient_c"] is not None else "",
                r["humidity"] if r["humidity"] is not None else "",
                r["gel_mass_g"] if r["gel_mass_g"] is not None else "",
                water_percent(r["gel_mass_g"]) or "",
                int(r["pump_on"]),
            ]
        )

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="sweatshell_session_{session_id}.csv"'
        },
    )


@app.post("/api/scale")
def scale(q: ScaleQuery):
    """
    Scale the measured water cost up to a real roof.

    This is deliberately front and centre rather than buried: the first serious
    objection to SweatShell is water use, and the only honest reply is a number.
    """
    latest_readings = db.readings_since(86400)
    grams = grams_evaporated(latest_readings)
    span_hours = (
        (latest_readings[-1]["ts"] - latest_readings[0]["ts"]) / 3600.0
        if len(latest_readings) > 1
        else 0.0
    )

    # Measured litres per m2 per hour, from the test rig's own gel area.
    # Set gel_area_m2 to the real pad area you used, or this is just arithmetic on a guess.
    gel_area_m2 = config.get("gel_area_m2", 0.06)
    if span_hours <= 0.01 or gel_area_m2 <= 0:
        return {
            "ready": False,
            "message": "Not enough measured data yet to scale up. Run a session first.",
        }

    litres_per_m2_per_hour = (grams / 1000.0) / gel_area_m2 / span_hours
    litres_per_hot_day = litres_per_m2_per_hour * q.roof_area_m2 * q.hours_per_hot_day
    litres_per_season = litres_per_hot_day * q.hot_days_per_year

    return {
        "ready": True,
        "measured": {
            "gel_area_m2": gel_area_m2,
            "grams_evaporated": grams,
            "hours": round(span_hours, 2),
            "litres_per_m2_per_hour": round(litres_per_m2_per_hour, 3),
        },
        "projected": {
            "roof_area_m2": q.roof_area_m2,
            "litres_per_hot_day": round(litres_per_hot_day, 1),
            "litres_per_season": round(litres_per_season, 1),
            "hot_days_per_year": q.hot_days_per_year,
            "tank_litres": q.tank_litres,
            "tank_covers_hot_days": (
                round(q.tank_litres / litres_per_hot_day, 1)
                if litres_per_hot_day > 0
                else None
            ),
            "tank_is_enough": litres_per_season <= q.tank_litres,
        },
        "note": (
            "Sweat mode is intended for extreme-heat days only, fed from a rainwater "
            "tank. Running it every summer day is not the proposal."
        ),
    }
