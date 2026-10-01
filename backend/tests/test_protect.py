"""
The backend acting on the forecast: protective roll-up and the daily schedule.

The forecast is pinned and the database calls are stubbed, so these never touch the
network or the real readings.
"""

import time

import pytest

import db
import forecast
import main

H = 3600


def gusty_forecast(start: float, hours: int = 3, gust: float = 55.0) -> dict:
    """A forecast with one gusty stretch beginning at `start`."""
    base = start - 12 * H
    return {
        "source": "live",
        "days": [],
        "hours": [
            {
                "ts": base + i * H,
                "gust_kmh": gust if start <= base + i * H < start + hours * H else 15.0,
                "code": 3,
                "rain_mm": 0.0,
            }
            for i in range(48)
        ],
    }


@pytest.fixture
def env(monkeypatch):
    events = []
    monkeypatch.setattr(db, "active_session", lambda: None)
    monkeypatch.setattr(db, "log_event", lambda kind, msg, *a: events.append(msg))
    monkeypatch.setattr(main, "_sheet_out", True)
    monkeypatch.setattr(main, "_sheet_request", None)
    monkeypatch.setattr(main, "_protect_fired_for", None)
    monkeypatch.setattr(main, "_schedule_fired", {})
    monkeypatch.setattr(main, "protect", {**main.protect, "enabled": True, "auto": True})
    monkeypatch.setattr(
        main, "schedule", {"enabled": True, "roll_out_at": "00:00", "roll_up_at": "23:59"}
    )

    def pin(fc):
        monkeypatch.setattr(forecast, "fetch", lambda force=False: fc)

    return pin, events


def test_rolls_up_inside_lead_time(env):
    pin, events = env
    pin(gusty_forecast(time.time() + 1 * H))  # gust in an hour, lead is two
    main.tick_protect()
    assert main._sheet_request == "up"
    assert "gusts to 55" in events[-1].lower()


def test_does_not_roll_up_hours_early(env):
    pin, _ = env
    pin(gusty_forecast(time.time() + 6 * H))
    main.tick_protect()
    assert main._sheet_request is None


def test_warn_only_does_not_move_the_motor(env, monkeypatch):
    pin, _ = env
    monkeypatch.setitem(main.protect, "auto", False)
    pin(gusty_forecast(time.time() + 1 * H))
    main.tick_protect()
    assert main._sheet_request is None


def test_fires_once_per_window_so_a_person_can_overrule_it(env, monkeypatch):
    pin, _ = env
    pin(gusty_forecast(time.time() + 1 * H))
    main.tick_protect()
    assert main._sheet_request == "up"
    # The person rolls it back out on purpose.
    monkeypatch.setattr(main, "_sheet_request", None)
    monkeypatch.setattr(main, "_sheet_out", True)
    main.tick_protect()
    assert main._sheet_request is None


def test_schedule_will_not_roll_out_into_a_storm(env, monkeypatch):
    pin, events = env
    monkeypatch.setattr(main, "_sheet_out", False)
    pin(gusty_forecast(time.time() + 1 * H))
    main.tick_schedule()
    assert main._sheet_request is None
    assert any("skipped" in e for e in events)


def test_warn_only_leaves_the_schedule_alone(env, monkeypatch):
    pin, _ = env
    monkeypatch.setattr(main, "_sheet_out", False)
    monkeypatch.setitem(main.protect, "auto", False)
    pin(gusty_forecast(time.time() + 1 * H))
    main.tick_schedule()
    assert main._sheet_request == "out"


def test_schedule_rolls_out_on_a_calm_day(env, monkeypatch):
    pin, _ = env
    monkeypatch.setattr(main, "_sheet_out", False)
    pin(gusty_forecast(time.time() + 30 * H))  # tomorrow, out of range
    main.tick_schedule()
    assert main._sheet_request == "out"


def test_forecast_endpoint_lists_risk_windows(env):
    pin, _ = env
    pin(gusty_forecast(time.time() + 3 * H))
    out = main.get_forecast()
    assert len(out["risks"]) == 1
    assert out["risks"][0]["peak_gust_kmh"] == 55.0
