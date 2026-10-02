"""
Does changing a threshold in the app actually change it on the roof unit?

This started as a question rather than a test, and the answer at the time was no:
the app sent /set, cleared its queue and reported success without ever checking.
Pointed at a device with no /set at all it still said "saved", and the old number
reappeared one poll later with nothing on screen to explain it.

So the bridge now believes the device's own report rather than its own request, and
these are the three answers it has to be able to give:

    takes it     -> the device reports the new number, no error
    ignores it   -> 200, same old number, and the app says the names do not match
    refuses it   -> 404, and the app says the firmware will not take settings

Run from backend/ with the venv:  .venv/bin/python ../tests/test_device_settings.py
"""

import sys
import threading
import time
from http.server import HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import bridge  # noqa: E402
import fake_esp  # noqa: E402

PASS, FAIL = 0, 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ok   {label}")
    else:
        FAIL += 1
        print(f"  FAIL {label}" + (f" — {detail}" if detail else ""))


class Ignores(fake_esp.Handler):
    """Answers /set with 200 and changes nothing — a sketch reading other names."""

    def do_GET(self):
        if self.path.startswith("/set"):
            return self._send(fake_esp.data())
        return super().do_GET()


class Refuses(fake_esp.Handler):
    """No /set at all, which is what the sketch looked like before this was added."""

    def do_GET(self):
        if self.path.startswith("/set"):
            return self._send({"error": "not found"}, 404)
        return super().do_GET()


def serve(handler, port):
    srv = HTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run_against(handler, port, patch):
    """Point a bridge at one device, ask for a threshold, return what it concluded."""
    fake_esp.STATE["settings"] = {
        "hot": 26.0, "cool": 22.0, "danger": 30.0, "dry_pct": 30,
        "humidity": -1, "moist_dry_raw": 3500, "moist_wet_raw": 1500,
        "h1": 0, "h2": 1, "out": 2,
    }
    srv = serve(handler, port)
    bridge.forget_settings_error()
    b = bridge.Bridge(
        cfg_getter=lambda: {"gel_full_g": 1000.0, "gel_dry_g": 400.0},
        bridge_cfg_getter=lambda: {
            "enabled": True,
            "url": f"http://127.0.0.1:{port}",
            "poll_seconds": 0.2,
        },
        on_reading=lambda r: None,
        take_command=lambda: (None, None),
    )
    b.start()
    try:
        # Let it connect before asking for anything, then give it several polls:
        # the write goes out on one and is confirmed on the next.
        time.sleep(1.0)
        bridge.set_device_settings(patch)
        time.sleep(1.5)
        return bridge.status(), dict(fake_esp.STATE["settings"])
    finally:
        b.stop()
        srv.shutdown()
        time.sleep(0.3)


print("a device that takes the change")
st, settings = run_against(fake_esp.Handler, 8231, {"hot": 28, "dry": 45})
check("the device is holding the new threshold", settings["hot"] == 28.0, str(settings))
check("and the new water level too", settings["dry_pct"] == 45, str(settings))
check("the app reports it back", (st["device_settings"] or {}).get("hot") == 28.0)
check("with no error", st["settings_error"] is None, str(st["settings_error"]))

print()
print("a device that answers 200 and ignores it")
st, settings = run_against(Ignores, 8232, {"hot": 31})
check("the device kept its old threshold", settings["hot"] == 26.0, str(settings))
check(
    "the app does not claim it saved",
    st["settings_error"] is not None and "kept its old" in st["settings_error"],
    str(st["settings_error"]),
)

print()
print("a device with no /set endpoint")
st, settings = run_against(Refuses, 8233, {"hot": 31})
check(
    "the app says the firmware refused it",
    st["settings_error"] is not None and "404" in st["settings_error"],
    str(st["settings_error"]),
)

print()
if FAIL:
    print(f"{FAIL} failed, {PASS} passed")
    sys.exit(1)
print("all device settings checks passed")
