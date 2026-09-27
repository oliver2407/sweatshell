"""
SQLite storage. Plain stdlib sqlite3 on purpose: one file, no migrations, nothing
to configure at 2am.
"""

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent / "sweatshell.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          REAL NOT NULL,
    session_id  INTEGER,
    roof_json   TEXT NOT NULL,
    inside_json TEXT NOT NULL,
    gel_mass_g  REAL,
    ambient_c   REAL,
    humidity    REAL,
    pump_on     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);
CREATE INDEX IF NOT EXISTS idx_readings_session ON readings(session_id);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL,
    started_at REAL NOT NULL,
    ended_at   REAL,
    notes      TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,
    session_id INTEGER,
    kind       TEXT NOT NULL,
    message    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL so the simulator writing and the dashboard reading do not block each other.
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


_conn = connect()
_conn.executescript(SCHEMA)
_conn.commit()


def db() -> sqlite3.Connection:
    return _conn


# --- readings ---------------------------------------------------------------


def insert_reading(
    roof: dict,
    inside: dict,
    gel_mass_g: float | None,
    ambient_c: float | None,
    humidity: float | None,
    pump_on: bool,
    session_id: int | None,
    ts: float | None = None,
) -> int:
    cur = _conn.execute(
        """INSERT INTO readings
           (ts, session_id, roof_json, inside_json, gel_mass_g, ambient_c, humidity, pump_on)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            ts or time.time(),
            session_id,
            json.dumps(roof),
            json.dumps(inside),
            gel_mass_g,
            ambient_c,
            humidity,
            1 if pump_on else 0,
        ),
    )
    _conn.commit()
    return cur.lastrowid


def _row_to_reading(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "ts": row["ts"],
        "session_id": row["session_id"],
        "roof": json.loads(row["roof_json"]),
        "inside": json.loads(row["inside_json"]),
        "gel_mass_g": row["gel_mass_g"],
        "ambient_c": row["ambient_c"],
        "humidity": row["humidity"],
        "pump_on": bool(row["pump_on"]),
    }


def latest_reading(session_id: int | None = None) -> dict | None:
    if session_id is not None:
        row = _conn.execute(
            "SELECT * FROM readings WHERE session_id = ? ORDER BY ts DESC LIMIT 1",
            (session_id,),
        ).fetchone()
    else:
        row = _conn.execute("SELECT * FROM readings ORDER BY ts DESC LIMIT 1").fetchone()
    return _row_to_reading(row) if row else None


def readings_since(seconds: float, session_id: int | None = None) -> list[dict]:
    since = time.time() - seconds
    if session_id is not None:
        rows = _conn.execute(
            "SELECT * FROM readings WHERE session_id = ? ORDER BY ts ASC", (session_id,)
        ).fetchall()
    else:
        rows = _conn.execute(
            "SELECT * FROM readings WHERE ts >= ? ORDER BY ts ASC", (since,)
        ).fetchall()
    return [_row_to_reading(r) for r in rows]


def session_readings(session_id: int) -> list[dict]:
    rows = _conn.execute(
        "SELECT * FROM readings WHERE session_id = ? ORDER BY ts ASC", (session_id,)
    ).fetchall()
    return [_row_to_reading(r) for r in rows]


# --- sessions ---------------------------------------------------------------


def start_session(label: str, notes: str | None = None) -> dict:
    # Only one open session at a time, so a forgotten stop does not corrupt the next run.
    _conn.execute(
        "UPDATE sessions SET ended_at = ? WHERE ended_at IS NULL", (time.time(),)
    )
    cur = _conn.execute(
        "INSERT INTO sessions (label, started_at, notes) VALUES (?, ?, ?)",
        (label, time.time(), notes),
    )
    _conn.commit()
    return get_session(cur.lastrowid)


def stop_session(session_id: int) -> dict | None:
    _conn.execute(
        "UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
        (time.time(), session_id),
    )
    _conn.commit()
    return get_session(session_id)


def get_session(session_id: int) -> dict | None:
    row = _conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return dict(row) if row else None


def active_session() -> dict | None:
    row = _conn.execute(
        "SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


def list_sessions() -> list[dict]:
    rows = _conn.execute(
        """SELECT s.*, COUNT(r.id) AS reading_count
           FROM sessions s LEFT JOIN readings r ON r.session_id = s.id
           GROUP BY s.id ORDER BY s.started_at DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


# --- events -----------------------------------------------------------------


def log_event(kind: str, message: str, session_id: int | None = None) -> None:
    _conn.execute(
        "INSERT INTO events (ts, session_id, kind, message) VALUES (?, ?, ?, ?)",
        (time.time(), session_id, kind, message),
    )
    _conn.commit()


def recent_events(limit: int = 40, session_id: int | None = None) -> list[dict]:
    if session_id is not None:
        rows = _conn.execute(
            "SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
    else:
        rows = _conn.execute(
            "SELECT * FROM events ORDER BY ts DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
