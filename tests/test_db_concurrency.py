"""
Concurrency check for the shared SQLite connection.

The bridge writes a reading every few seconds from its own thread while request
handlers read and write from the server's threadpool. One connection, many threads.
This drives that harder than the real thing ever will and insists nothing raises
and nothing is lost.

Without the lock around db.py's public functions this fails with
sqlite3.ProgrammingError or a recursive-use error — intermittently, which is the
worst kind, and which from the app looks like buttons that sometimes do nothing.

    cd backend && .venv/bin/python ../tests/test_db_concurrency.py
"""

import os
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

# A scratch database, set before the import that reads it, so a real install's
# measurements are never touched by a test.
os.environ["SWEATSHELL_DB"] = str(Path(tempfile.mkdtemp()) / "test.db")

import db  # noqa: E402

WRITERS, READERS, PER_THREAD = 4, 4, 60

errors: list[str] = []


def writer(n: int):
    try:
        for i in range(PER_THREAD):
            db.insert_reading(
                roof={"box3": 50.0 + i * 0.01},
                inside={"box3": 28.0 + i * 0.01},
                gel_mass_g=200.0,
                ambient_c=30.0,
                humidity=None,
                pump_on=False,
                session_id=None,
                sheet_out=True,
            )
            db.save_setting(f"probe{n}", {"i": i})
    except Exception as exc:
        errors.append(f"writer {n}: {type(exc).__name__}: {exc}")


def reader(n: int):
    try:
        for _ in range(PER_THREAD):
            db.latest_reading()
            db.readings_since(3600)
            db.load_setting("config", {})
            db.recent_events(5)
    except Exception as exc:
        errors.append(f"reader {n}: {type(exc).__name__}: {exc}")


before = len(db.readings_since(10 * 365 * 86400))

threads = [threading.Thread(target=writer, args=(i,)) for i in range(WRITERS)]
threads += [threading.Thread(target=reader, args=(i,)) for i in range(READERS)]
for t in threads:
    t.start()
for t in threads:
    t.join()

after = len(db.readings_since(10 * 365 * 86400))
written = after - before
expected = WRITERS * PER_THREAD

print(f"threads: {WRITERS} writing, {READERS} reading, {PER_THREAD} ops each")
print(f"rows written: {written} (expected {expected})")
print(f"errors: {len(errors)}")
for e in errors[:5]:
    print("  ", e)

if errors or written != expected:
    print("\nFAILED")
    sys.exit(1)
print("\nall concurrency checks passed")
