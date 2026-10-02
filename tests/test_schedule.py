"""
Schedule-window logic checks.

The parts worth testing are the ones a demo will not exercise: a window that runs
through midnight, a window restricted to some weekdays, a window with an end date
that has passed, and the edge-triggering that lets a manual roll-up stand.

Run from backend/ with the venv:  .venv/bin/python ../tests/test_schedule.py
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import main  # noqa: E402


def at(day: str, hhmm: str) -> time.struct_time:
    """A struct_time for a given date and time, in local time."""
    return time.strptime(f"{day} {hhmm}", "%Y-%m-%d %H:%M")


def set_windows(*windows, enabled=True):
    main.schedule["enabled"] = enabled
    main.schedule["windows"] = list(windows)


def win(**kw):
    base = {
        "id": kw.pop("id", 1),
        "enabled": True,
        "out_at": "08:00",
        "up_at": "19:00",
        "repeat": "weekly",
        "days": [0, 1, 2, 3, 4, 5, 6],
        "dates": [1],
        "from": None,
        "to": None,
        "label": "",
    }
    base.update(kw)
    return base


failures = []


def check(name, got, want):
    if got == want:
        print(f"  ok   {name}")
    else:
        print(f"  FAIL {name}: got {got!r}, wanted {want!r}")
        failures.append(name)


# 2026-10-05 is a Monday, 2026-10-10 a Saturday.
MON, SAT = "2026-10-05", "2026-10-10"

print("a plain daytime window")
set_windows(win(out_at="08:00", up_at="19:00"))
check("before it opens", main.desired_sheet_state(at(MON, "07:59")), False)
check("just after it opens", main.desired_sheet_state(at(MON, "08:00")), True)
check("middle", main.desired_sheet_state(at(MON, "13:00")), True)
check("at the close", main.desired_sheet_state(at(MON, "19:00")), False)

print("\ntwo windows with a gap at lunch")
set_windows(
    win(id=1, out_at="07:00", up_at="11:30"),
    win(id=2, out_at="14:00", up_at="20:00"),
)
check("morning", main.desired_sheet_state(at(MON, "09:00")), True)
check("lunch gap", main.desired_sheet_state(at(MON, "12:30")), False)
check("afternoon", main.desired_sheet_state(at(MON, "15:00")), True)
check("evening", main.desired_sheet_state(at(MON, "21:00")), False)

print("\na window through midnight")
set_windows(win(out_at="21:00", up_at="05:00"))
check("before", main.desired_sheet_state(at(MON, "20:00")), False)
check("late evening", main.desired_sheet_state(at(MON, "22:00")), True)
check("small hours", main.desired_sheet_state(at(MON, "03:00")), True)
check("after it closes", main.desired_sheet_state(at(MON, "06:00")), False)

print("\nweekdays only")
set_windows(win(days=[0, 1, 2, 3, 4]))
check("Monday noon", main.desired_sheet_state(at(MON, "12:00")), True)
# No window applies on Saturday, so the schedule has no opinion and whatever the
# person last did stands.
check("Saturday noon", main.desired_sheet_state(at(SAT, "12:00")), None)

print("\na window with a date range")
set_windows(win(**{"from": "2026-10-01", "to": "2026-10-07"}))
check("inside the range", main.desired_sheet_state(at(MON, "12:00")), True)
check("after it ends", main.desired_sheet_state(at(SAT, "12:00")), None)

print("\nschedule switched off")
set_windows(win(), enabled=False)
check("no opinion", main.desired_sheet_state(at(MON, "12:00")), None)

print("\nedge triggering lets a manual roll-up stand")
set_windows(win(out_at="08:00", up_at="19:00"))
main._last_desired = None
main._sheet_out = False
main._sheet_request = None
main.protect["auto"] = False

# Pinned to noon, inside the window. Left to the real clock this passed all
# afternoon and failed at 19:00, when the window it builds happens to close.
NOON = at(MON, "12:00")

main.tick_schedule(NOON)  # first look after a restart: align with the schedule
check("first tick asks for out", main._sheet_request, "out")

# The person rolls it up by hand mid-window.
main._sheet_request = None
main._sheet_out = False
main.tick_schedule(NOON)
check("schedule does not undo it", main._sheet_request, None)

print("\nrepeat: daily")
set_windows(win(repeat="daily", days=[]))
check("ignores the weekday list", main.desired_sheet_state(at(SAT, "12:00")), True)

print("\nrepeat: monthly")
# 2026-10-01 is a Thursday, 2026-10-15 a Thursday.
set_windows(win(repeat="monthly", dates=[1, 15], days=[]))
check("on the 1st", main.desired_sheet_state(at("2026-10-01", "12:00")), True)
check("on the 15th", main.desired_sheet_state(at("2026-10-15", "12:00")), True)
check("on the 2nd, no opinion", main.desired_sheet_state(at("2026-10-02", "12:00")), None)

# A 31st does not come round in November. Skipping is what calendars do; sliding it
# to the 30th would move a schedule the person never moved.
set_windows(win(repeat="monthly", dates=[31], days=[]))
check("31st exists in October", main.desired_sheet_state(at("2026-10-31", "12:00")), True)
check(
    "and is skipped in November",
    main.desired_sheet_state(at("2026-11-30", "12:00")),
    None,
)
nxt = main.next_change(at("2026-11-01", "12:00"))
check("next monthly run is found past a short month", nxt is not None, True)

print("\nnext change, which is what the Auto button promises")
set_windows(win(out_at="08:00", up_at="19:00"))
nxt = main.next_change(at(MON, "09:00"))
check("mid-window, next move is up at 19:00", (nxt["at"], nxt["to"]), ("19:00", "up"))
nxt = main.next_change(at(MON, "20:00"))
check("after close, next move is out at 08:00", (nxt["at"], nxt["to"]), ("08:00", "out"))
check("and it is not today", nxt["today"], False)

set_windows(
    win(id=1, out_at="07:00", up_at="11:30"),
    win(id=2, out_at="14:00", up_at="20:00"),
)
nxt = main.next_change(at(MON, "09:00"))
check("with a lunch gap, up at 11:30 comes first", nxt["at"], "11:30")
nxt = main.next_change(at(MON, "12:00"))
check("in the gap, out at 14:00 is next", (nxt["at"], nxt["to"]), ("14:00", "out"))

# Two windows that touch: 07:00-12:00 and 12:00-16:00 is one unbroken stretch, so
# the boundary at noon is not a change and must not be reported as one.
set_windows(
    win(id=1, out_at="07:00", up_at="12:00"),
    win(id=2, out_at="12:00", up_at="16:00"),
)
nxt = main.next_change(at(MON, "09:00"))
check("touching windows do not report a move at the join", nxt["at"], "16:00")

set_windows(win(), enabled=False)
check("switched off, nothing is promised", main.next_change(at(MON, "09:00")), None)

print()
if failures:
    print(f"{len(failures)} FAILED: {', '.join(failures)}")
    sys.exit(1)
print("all schedule checks passed")
