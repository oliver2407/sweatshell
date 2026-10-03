"""
The home screen shows the last twelve hours — and nothing else.

This is a regression test for the worst bug this app has had, because it was silent
and it looked plausible. home_readings() used to prefer a running bench session over
the wall-clock window. A session started days earlier and never stopped is still
"running", so the chart drew that instead of today: a week-wide span titled "last
185.1 hours", flat at 38° from a rig baking in a test, beside a dial reading 22.4°
from the roof unit answering right now. Two numbers, both labelled inside, sixteen
degrees apart, with nothing on screen able to explain it — because they were not
looking at the same days at all.

Run from backend/ with the venv:  .venv/bin/python ../tests/test_home_window.py
"""

import json
import os
import sys
import tempfile
import time
from pathlib import Path

DB = Path(tempfile.mkdtemp()) / "home_window.db"
os.environ["SWEATSHELL_DB"] = str(DB)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import db  # noqa: E402
import main  # noqa: E402

PASS, FAIL = 0, 0


def check(label: str, got, want) -> None:
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  ok   {label}")
    else:
        FAIL += 1
        print(f"  FAIL {label}: got {got!r}, wanted {want!r}")


def reading(ts: float, box3: float, session_id=None, source="device") -> None:
    db.insert_reading(
        roof={},
        inside={"box1": box3 + 6.0, "box3": box3},
        gel_mass_g=800.0,
        ambient_c=30.0,
        humidity=None,
        pump_on=False,
        session_id=session_id,
        ts=ts,
        sheet_out=True,
        source=source,
    )


now = time.time()
HOUR = 3600.0

# A bench session from a week ago that nobody stopped, baking at 38-40.
stale_session = db.start_session("Bench run nobody stopped")["id"]
for i in range(60):
    reading(now - (190 - i * 0.5) * HOUR, 38.0 + (i % 5) * 0.4, stale_session)

# And the roof unit, reporting a cool house over the last two hours.
for i in range(40):
    reading(now - (2 - i * 0.05) * HOUR, 22.0 + (i % 4) * 0.1)

print("a bench session left running for a week")
check("it is still open", db.active_session() is not None, True)

rows = main.home_readings()
check("the home screen takes none of its readings", len(rows), 40)

spread = (rows[-1]["ts"] - rows[0]["ts"]) / HOUR
check("the span is hours, not days", spread < 12.0, True)

hottest = max(r["inside"]["box3"] for r in rows)
check("nothing from the bench is charted", hottest < 30.0, True)

print()
print("a simulator run from ten minutes ago, inside the window")
# simulate.py posts to the same endpoint the roof unit uses, so these land right
# beside the real ones and well within twelve hours. Being recent is exactly why
# the window alone cannot keep them off a resident's chart.
for i in range(30):
    reading(now - (10 - i * 0.3) * 60, 40.0 + (i % 3) * 0.5, source="sim")

rows = main.home_readings()
check("still only the roof unit's readings", len(rows), 40)
check("the invented 40° is not charted",
      max(r["inside"]["box3"] for r in rows) < 30.0, True)

print()
print("the chart and the dial cannot disagree")
# Device-only, which is what the dial itself reads. Comparing against an
# unfiltered latest would assert the bug: it returns the simulator's row.
latest = db.latest_reading(source="device")
series_last = main.home_series()[-1]["inside_c"]
check("same number on both", series_last, latest["inside"]["box3"])

print()
print("downsampling keeps the newest reading")
for n in (5, 9, 17, 33):
    pts = main.home_series(max_points=n)
    check(f"max_points={n} still ends on the live value",
          pts[-1]["inside_c"], latest["inside"]["box3"])

print()
if FAIL:
    print(f"{FAIL} failed, {PASS} passed")
    sys.exit(1)
print("all home window checks passed")
