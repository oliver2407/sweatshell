"""
A stand-in for the ESP32, speaking the firmware's own dialect.

It serves /data and accepts /cmd exactly as the sketch does, so the bridge can be
tested without the hardware on the bench — and so that if the bridge ever stops
working, it is possible to tell whether the device or the translation changed.

    python fake_esp.py --port 8123

The JSON shape here is copied from buildJson() in the sketch. If the firmware's
field names change, this file is where the mismatch shows up first.

/set is the one endpoint here that is a GUESS. The sketch reports its thresholds in
/data, so it is read back from there; what it calls them on the way *in* has not been
read from the real source. So this stand-in accepts both spellings, and the bridge
checks the device's own readback rather than trusting that a write landed — on the
real unit that check is what tells the truth.
"""

import argparse
import json
import random
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

STATE = {
    "house1": 34.0,  # no product: runs hot
    "house2": 28.0,  # with the sheet
    "outside": 30.0,
    "moist_pct": 62,
    "pump_on": False,
    "pump_until": 0.0,
    "roller": "out",
    "pos": 4096,
    "mode": "auto",
    "started": time.time(),
    "log": ["[00:00:00] Ready. Roller assumed rolled UP at start"],
    # Thresholds live here rather than in data() so that a /set actually changes
    # what the next /data reports. Hard-coding them made every settings test pass
    # for the wrong reason: the numbers came back right because they could not move.
    "settings": {
        "hot": 26.0, "cool": 22.0, "danger": 30.0, "dry_pct": 30,
        "humidity": -1, "moist_dry_raw": 3500, "moist_wet_raw": 1500,
        "h1": 0, "h2": 1, "out": 2,
    },
}

# What each query argument writes to. "dry" and "dry_pct" land in the same place,
# because which of the two the real sketch reads is not known from its /data output.
SET_KEYS = {
    "hot": ("hot", float),
    "cool": ("cool", float),
    "danger": ("danger", float),
    "dry": ("dry_pct", int),
    "dry_pct": ("dry_pct", int),
    # Which DS18B20 on the bus is which. Index comes from the ROM address, not the
    # wiring order, so these have to be settable without opening the sketch.
    "h1": ("h1", int),
    "h2": ("h2", int),
    "out": ("out", int),
}


def tick():
    """Drift the numbers a little so the chart is not a flat line."""
    for k in ("house1", "house2", "outside"):
        STATE[k] += random.gauss(0, 0.08)
    if STATE["pump_on"]:
        if time.time() > STATE["pump_until"]:
            STATE["pump_on"] = False
            STATE["log"].append("[--] Pump OFF")
        else:
            STATE["moist_pct"] = min(100, STATE["moist_pct"] + 3)
    elif STATE["roller"] == "out":
        STATE["moist_pct"] = max(0, STATE["moist_pct"] - 0.4)


def data():
    tick()
    return {
        "uptime_s": int(time.time() - STATE["started"]),
        "temps": {
            "house1": round(STATE["house1"], 2),
            "house2": round(STATE["house2"], 2),
            "outside": round(STATE["outside"], 2),
        },
        "cooling_c": round(STATE["house1"] - STATE["house2"], 2),
        "raw_temps": [round(STATE["house1"], 2), round(STATE["house2"], 2)],
        "moisture": {"raw": 2200, "pct": int(STATE["moist_pct"])},
        "pump_on": STATE["pump_on"],
        "roller": {"state": STATE["roller"], "pos": STATE["pos"], "out_steps": 4096},
        "mode": STATE["mode"],
        "blackout": False,
        "settings": dict(STATE["settings"]),
        "log": STATE["log"][-12:],
    }


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass  # the test output is the interesting part, not the access log

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)

        if u.path == "/data":
            return self._send(data())

        if u.path == "/set":
            wrote = {}
            for arg, raw in q.items():
                if arg not in SET_KEYS:
                    continue  # an Arduino sketch ignores arguments it does not read
                key, cast = SET_KEYS[arg]
                try:
                    STATE["settings"][key] = cast(float(raw[0]))
                except (TypeError, ValueError):
                    return self._send({"error": f"bad value for {arg}"}, 400)
                wrote[key] = STATE["settings"][key]
            if not wrote:
                return self._send({"error": "nothing to set"}, 400)
            STATE["log"].append(f"[--] set {wrote}")
            print(f"  device <- set {wrote}")
            return self._send(data())

        if u.path == "/cmd":
            a = (q.get("a") or [""])[0]
            if a == "out":
                STATE["roller"], STATE["pos"], STATE["mode"] = "out", 4096, "manual"
            elif a == "up":
                STATE["roller"], STATE["pos"], STATE["mode"] = "up", 0, "manual"
            elif a == "pump":
                STATE["mode"] = "manual"
                STATE["pump_on"] = True
                STATE["pump_until"] = time.time() + 3
            elif a == "manual":
                STATE["mode"] = "manual"
            elif a == "auto":
                STATE["mode"] = "auto"
            else:
                return self._send({"error": "unknown command"}, 400)
            STATE["log"].append(f"[--] cmd {a}")
            print(f"  device <- {a}")
            return self._send(data())

        self._send({"error": "not found"}, 404)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8123)
    args = ap.parse_args()
    print(f"Fake ESP32 on http://127.0.0.1:{args.port}  (/data, /cmd)")
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
