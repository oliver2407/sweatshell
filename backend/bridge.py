"""
Bridge to the ESP32.

The firmware is a web server: it serves /data and takes commands on /cmd. This
backend was written expecting the device to post to it. Rather than change
firmware that already works on real hardware, the backend comes to the device —
it polls /data on a timer, translates each reading into the shape the rest of the
app already understands, and forwards any pending pump or roller command to /cmd.

Nothing in the firmware changes. Nothing in the app changes. This file is the only
place that knows both vocabularies.

WHO DECIDES

The device's own auto mode is the primary one: roll out when the air outside goes
above hotC, roll up below coolC, pump when the gel is dry. It lives in the firmware,
it already works on real hardware, and it triggers on OUTSIDE temperature — which
leads the heat rather than lagging it, so it moves the sheet before the house is hot
rather than after.

The backend's clock schedule is the other option, for anyone who would rather say
"out at seven, up at eight" than pick a number in degrees.

They are alternatives, not layers. Running both means the clock rolls the sheet out
at 8am and the thermostat rolls it straight back up because the morning is still
cool, and neither is wrong. So the schedule stands down whenever the device is in
auto, and the app's Auto button is what hands control back to the device.
"""

import threading
import time

import httpx

# Defaults for a fresh install. Once anything is set through /api/bridge the stored
# value wins and editing these does nothing.
#
# The address is the rig's own: 172.20.10.x is an iPhone personal-hotspot subnet,
# which is what the roof unit joins. The machine running this backend has to be on
# that same hotspot — a laptop quietly rejoining the house wifi is the most common
# way this looks broken when nothing is.
DEFAULTS = {
    "enabled": True,
    "url": "http://172.20.10.10",  # as printed on the device's serial at boot
    "poll_seconds": 3.0,
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
    "device_settings": None,  # the firmware's own thresholds, last seen
    "settings_error": None,  # set a threshold and the device did not take it
    "polls": 0,
}

# Queued for the device on the next poll. The firmware owns its thresholds; the app
# edits them through /set rather than keeping a second copy that has to agree.
_want_mode: str | None = None
_want_settings: dict = {}

# Sent to /set, waiting to be confirmed against the device's own next report.
_sent_settings: dict = {}

# What a threshold is called going out, versus coming back in /data. /data is the
# only source for these names that has been read from the device itself; the write
# side is inferred, so "dry" is sent alongside "dry_pct" and whichever the sketch
# reads wins. The readback below is what settles it — without it the app would be
# claiming a change it never made.
_READ_AS = {"dry": "dry_pct"}
_ALSO_SEND = {"dry": "dry_pct"}


def set_mode(mode: str) -> None:
    """auto hands control to the device's thresholds; manual takes it back."""
    global _want_mode
    _want_mode = mode if mode in ("auto", "manual") else None


def set_device_settings(patch: dict) -> None:
    _want_settings.update(patch)
    _state["settings_error"] = None  # a fresh attempt, not the old verdict


def forget_settings_error() -> None:
    """Drop the last verdict — the device it was about is no longer the one here."""
    _state["settings_error"] = None


def _took(reported: dict, key: str, asked) -> bool:
    """Did the device come back reporting the number we asked it to hold?"""
    got = reported.get(_READ_AS.get(key, key))
    if got is None:
        # Not reported at all, so there is nothing to confirm it against. Counting
        # silence as success is how a write that never happened looks like one.
        return False
    try:
        return abs(float(got) - float(asked)) <= 0.01
    except (TypeError, ValueError):
        return False


def explain(exc: Exception, url: str) -> str:
    """
    Why the roof unit did not answer, in words someone can act on.

    A stack trace tells you what the library felt. These tell you which wire to go
    and look at, which is the only question being asked at 2am before a demo.
    """
    if isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout)):
        return (
            f"Nothing answered at {url}. Usually this machine and the roof unit are "
            "on different wifi — the unit joins the phone hotspot, and laptops "
            "quietly rejoin the house network."
        )
    if isinstance(exc, httpx.ReadTimeout):
        return "The roof unit took too long to answer. Weak signal, or it is busy driving the motor."
    if isinstance(exc, httpx.HTTPStatusError):
        return f"The address answered with HTTP {exc.response.status_code}, not a reading."
    if isinstance(exc, ValueError):  # covers JSON decode
        return f"Something answered at {url}, but it was not the roof unit."
    return f"{type(exc).__name__}: {exc}"


def status() -> dict:
    """Enough for the app to say whether the roof unit is actually answering."""
    age = (time.time() - _state["last_ok"]) if _state["last_ok"] else None
    return {
        **_state,
        "seconds_since_ok": round(age, 1) if age is not None else None,
        # Connected means the last attempt worked. Reporting it from the age alone
        # left the app claiming a healthy connection while an error from two seconds
        # ago sat right beside it.
        "connected": _state["last_error"] is None and age is not None and age < 15,
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
                    _state["last_error"] = explain(exc, b.get("url", "?"))
                    # A failed poll means the claim has to be made again when the
                    # device comes back; it may have rebooted into auto mode.
                    self._claimed = False
                self._stop.wait(max(1.0, float(b.get("poll_seconds", 3.0))))

    def _tick(self, client: httpx.Client, b: dict) -> None:
        global _want_mode
        base = b["url"].rstrip("/")

        # The firmware owns its thresholds. Editing them here writes through to the
        # device rather than keeping a second copy in this app that has to agree
        # with the first.
        #
        # A write is never assumed to have worked. The first version fired this off,
        # cleared the queue and said nothing — against a device with no /set at all
        # the app answered "saved", the number sprang back on the next poll, and
        # there was no error anywhere to explain it. Now the request is checked, and
        # then checked again against what the device itself reports below.
        global _sent_settings
        if _want_settings:
            asked = dict(_want_settings)
            _want_settings.clear()
            params = dict(asked)
            for k, alias in _ALSO_SEND.items():
                if k in asked:
                    params[alias] = asked[k]
            try:
                resp = client.get(f"{base}/set", params=params)
                if resp.status_code >= 400:
                    _state["settings_error"] = (
                        f"The roof unit refused the change ({resp.status_code}). Its "
                        "firmware may not take settings over wifi — change them in "
                        "the sketch and re-flash."
                    )
                else:
                    _sent_settings = asked
            except Exception as exc:
                _state["settings_error"] = explain(exc, base)

        # Hand the device any command the app has queued, before reading, so the
        # reading that comes back already reflects it.
        pump_seconds, sheet_move = self._take()
        if sheet_move in ("out", "up"):
            # The firmware drops to manual on any roll command of its own accord,
            # which is the behaviour we want: touching a button takes control.
            client.get(f"{base}/cmd", params={"a": sheet_move})
        if pump_seconds:
            # The firmware's pulse length is fixed in its own config; we ask for a
            # pulse, not a duration. Pretending otherwise would be a number the app
            # made up.
            client.get(f"{base}/cmd", params={"a": "pump"})

        r = client.get(f"{base}/data")
        r.raise_for_status()
        d = r.json()

        # Check it is actually the roof unit before trusting a word of it. Plenty of
        # things on a network answer with valid JSON, and without this the bridge
        # quietly fills the database with rows of nulls and the app shows dashes
        # while reporting a healthy connection.
        if not isinstance(d, dict) or "temps" not in d or "roller" not in d:
            raise ValueError("response is not a SweatShell reading")

        _state["device_mode"] = d.get("mode")
        _state["device_settings"] = d.get("settings")

        # The device has now had its say on the thresholds we asked for. If it is
        # still reporting the old numbers, the request reached it and was ignored —
        # almost certainly because the sketch reads a different argument name than
        # the one it reports. Either way the person needs to know the number on
        # their screen is not the number on their roof.
        if _sent_settings:
            got = d.get("settings") or {}
            missed = [k for k, v in _sent_settings.items() if not _took(got, k, v)]
            _state["settings_error"] = (
                None
                if not missed
                else (
                    "The roof unit answered but kept its old "
                    + ", ".join(missed)
                    + ". Its firmware uses different names for these settings, so "
                    "they have to be changed in the sketch."
                )
            )
            _sent_settings = {}

        _state["last_ok"] = time.time()
        _state["last_error"] = None
        _state["polls"] += 1

        # A mode change is sent after the read, so the reported mode above is what
        # the device actually had, not what we are about to ask for. The next poll
        # confirms it took.
        if _want_mode and d.get("mode") != _want_mode:
            client.get(f"{base}/cmd", params={"a": _want_mode})
        _want_mode = None

        self._on_reading(_to_reading(d, self._cfg()))
