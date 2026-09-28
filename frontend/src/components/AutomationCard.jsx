import { useEffect, useState } from "react";

/*
 * The two ways the sheet moves without being asked.
 *
 * A daily schedule, because the sheet's useful moves are slow and predictable — out
 * before the sun, up in the evening. A roof covering takes hours to change the
 * temperature inside, which is why there is no "roll out when it hits 26°C": by the
 * time an indoor thermometer notices, the heat is already in the house.
 *
 * And a protective roll-up from the forecast, because wind that could tear the sheet
 * has to be acted on before it arrives and nothing on the roof can see it coming.
 * This one warns by default and waits: a forecast can be wrong, and an unexpected
 * motor movement on someone's roof is not a good surprise.
 */

export default function AutomationCard({ home, busy, onSchedule, onProtect }) {
  const s = home.schedule;
  const p = home.protect;

  const [outAt, setOutAt] = useState(s.roll_out_at);
  const [upAt, setUpAt] = useState(s.roll_up_at);

  // Keep the inputs in step when the backend is the one that changed them.
  useEffect(() => setOutAt(s.roll_out_at), [s.roll_out_at]);
  useEffect(() => setUpAt(s.roll_up_at), [s.roll_up_at]);

  return (
    <div className="card">
      <h2>Move it by itself</h2>

      <div className="toggle">
        <span>
          On a schedule
          {s.enabled && (
            <>
              <br />
              <span className="k">
                out {s.roll_out_at} · up {s.roll_up_at}
              </span>
            </>
          )}
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={s.enabled}
          aria-label="Move it on a schedule"
          disabled={busy}
          onClick={() => onSchedule({ enabled: !s.enabled })}
        />
      </div>

      {s.enabled && (
        <div className="two">
          <label className="field">
            Roll out at
            <input
              type="time"
              value={outAt}
              disabled={busy}
              onChange={(e) => setOutAt(e.target.value)}
              onBlur={() => onSchedule({ roll_out_at: outAt })}
            />
          </label>
          <label className="field">
            Roll up at
            <input
              type="time"
              value={upAt}
              disabled={busy}
              onChange={(e) => setUpAt(e.target.value)}
              onBlur={() => onSchedule({ roll_up_at: upAt })}
            />
          </label>
        </div>
      )}

      <div className="toggle bordered">
        <span>
          Roll up in rough weather
          <br />
          <span className="k">gusts over {Math.round(p.wind_gust_kmh)} km/h</span>
        </span>
        <button
          className="switch"
          role="switch"
          aria-checked={p.auto}
          aria-label="Roll up in rough weather"
          disabled={busy}
          onClick={() => onProtect({ auto: !p.auto })}
        />
      </div>

      {p.warning && (
        <div className="notice">
          <strong>
            {formatDay(p.warning.date)} — {p.warning.reason}.
          </strong>{" "}
          {p.auto
            ? "It will roll itself up that morning."
            : "Roll it up before then so it doesn’t tear."}
        </div>
      )}

      {p.season_over && (
        <div className="notice">
          <strong>The next few days are mild.</strong> If the hot season is over, roll
          it up, dry it fully, and store it.
        </div>
      )}

      {p.forecast_source !== "live" && (
        <p className="tiny">
          {p.forecast_source === "cache"
            ? "Forecast is from the last successful update, not live."
            : "Sample forecast — no weather data reached this device."}
        </p>
      )}
    </div>
  );
}

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}
