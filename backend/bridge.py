"""
Bridge to the ESP32.

The firmware is a web server: it serves /data and takes commands on /cmd. This
backend was written expecting the device to post to it. Rather than change
firmware that already works on real hardware, the backend comes to the device —
it polls /data on a timer, translates each reading into the shape the rest of the
app already understands, and forwards any pending pump or roller command to /cmd.

Nothing in the firmware changes. Nothing in the app changes. This file is the only
place that knows both vocabularies.

ONE CONTROLLER, NOT TWO

The firmware has its own auto mode: roll out above hotC, roll up below coolC, pump
when the gel is dry. The backend has a schedule, a forecast and a wind rule. Left
both on, they fight — the clock rolls the sheet out at 8am and the thermostat rolls
it back up because the morning is still cool, and neither is wrong.

So the bridge puts the device into manual mode when it takes over, and says so.
Whoever is deciding, it is one of them.
"""

import threading
import time

import httpx

# Defaults; the real values live in the settings table and are editable at runtime.
DEFAULTS = {
    "enabled": False,
    "url": "http://192.168.1.60",  # the ESP32's address, as printed on its serial
    "poll_seconds": 3.0,
    "take_control": True,  # put the device in manual so the schedule is in charge
}

# What the firmware calls things, and what this app calls them.
#
#   firmware                    app
#   temps.house1                inside.box1   the house without the product
#   temps.house2                inside.box3   the house with it; the number on screen
#   temps.outside               ambient_c
#   moisture.pct                water level
#   roller.state                sheet_out
#
# box2 and box4 stay empty: they were the bench's coat-only and wet-cloth controls,
# and the real rig has no equivalent.

_state = {
    "last_ok": None,  # epoch of the last good poll
    "last_error": None,  # what went wrong, in words
    "device_mode": None,  # "auto" or "manual", as the device reports it
    "polls": 0,
}


def status() -> dict:
    """Enough for the app to say whether the roof unit is actually answering."""
    age = (time.time() - _state["last_ok"]) if _state["last_ok"] else None
    return {
        **_state,
        "seconds_since_ok": round(age, 1) if age is not None else None,
        "connected": age is not None and age < 15,
    }


def _to_reading(d: dict, cfg: dict) -> dict:
    """
    One /data response, in this app's terms.

    The gel level arrives as a percentage and the rest of the backend works in
    grams, so it is converted back to a mass against the configured full and dry
    weights. That keeps one water model in the app rather than two that have to
    agree — and it means the litres figures stay meaningful, provided someone
    actually weighed the pad.
    """
    temps = d.get("temps") or {}
    moisture = d.get("moisture") or {}
    roller = d.get("roller") or {}

    pct = moisture.get("pct")
    gel_mass = None
    if pct is not None:
        dry = cfg["gel_dry_mass_g"]
        span = cfg["gel_full_mass_g"] - dry
        gel_mass = dry + (max(0.0, min(100.0, float(pct))) / 100.0) * span

    state = (roller.get("state") or "").lower()
    # "rolling out" counts as out and "rolling up" as up, so the app shows where the
    # sheet is heading rather than flickering back to the old position mid-travel.
    if state in ("out", "partial", "rolling out"):
        sheet_out = True
    elif state in ("up", "rolling up"):
        sheet_out = False
    else:
        sheet_out = None

    return {
        "inside": {"box1": temps.get("house1"), "box3": temps.get("house2")},
        "roof": {},
        "ambient_c": temps.get("outside"),
        "humidity": None,  # the rig has no air-humidity sensor
        "gel_mass_g": gel_mass,
        "pump_on": bool(d.get("pump_on")),
        "sheet_out": sheet_out,
    }


class Bridge:
    def __init__(self, cfg_getter, bridge_cfg_getter, on_reading, take_command):
        """
        cfg_getter         -> the app's gel mass config
        bridge_cfg_getter  -> this bridge's own settings
        on_reading(dict)   -> hand a translated reading to the app
        take_command()     -> (pump_seconds | None, sheet_move | None), cleared on read
        """
        self._cfg = cfg_getter
        self._bcfg = bridge_cfg_getter
        self._on_reading = on_reading
        self._take = take_command
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._claimed = False

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._claimed = False

    def _run(self) -> None:
        with httpx.Client(timeout=4.0) as client:
            while not self._stop.is_set():
                b = self._bcfg()
                if not b.get("enabled"):
                    self._claimed = False
                    self._stop.wait(2.0)
                    continue
                try:
                    self._tick(client, b)
                except Exception as exc:
                    _state["last_error"] = f"{type(exc).__name__}: {exc}"
                self._stop.wait(max(1.0, float(b.get("poll_seconds", 3.0))))

    def _tick(self, client: httpx.Client, b: dict) -> None:
        base = b["url"].rstrip("/")

        # Hand the device any command the app has queued, before reading, so the
        # reading that comes back already reflects it.
        pump_seconds, sheet_move = self._take()
        if sheet_move in ("out", "up"):
            client.get(f"{base}/cmd", params={"a": sheet_move})
        if pump_seconds:
            # The firmware's pulse length is fixed in its own config; we ask for a
            # pulse, not a duration. Pretending otherwise would be a number the app
            # made up.
            client.get(f"{base}/cmd", params={"a": "pump"})

        r = client.get(f"{base}/data")
        r.raise_for_status()
        d = r.json()

        _state["device_mode"] = d.get("mode")
        _state["last_ok"] = time.time()
        _state["last_error"] = None
        _state["polls"] += 1

        # Claim control once per connection rather than every poll, so the device's
        # log does not fill with the same line.
        if b.get("take_control") and not self._claimed and d.get("mode") == "auto":
            client.get(f"{base}/cmd", params={"a": "manual"})
            self._claimed = True

        self._on_reading(_to_reading(d, self._cfg()))
