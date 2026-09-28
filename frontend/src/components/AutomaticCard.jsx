import { useEffect, useState } from "react";

/*
 * Everything that moves the sheet or the pump without being asked, in one place,
 * folded away.
 *
 * These are set once and then forgotten, so they do not belong between the person
 * and the numbers they check daily. What they decide, though, is worth stating
 * plainly, which is why each toggle carries a line of its own rather than a label.
 *
 * There is deliberately no "roll out when it gets hot inside" setting. A roof
 * covering takes hours to change the temperature indoors, so by the time an indoor
 * thermometer crosses a threshold the heat is already in the house. The clock is the
 * right controller for this; a thermostat is not.
 */

export default function AutomaticCard({ home, busy, onSchedule, onProtect, onAuto }) {
  const s = home.schedule;
  const p = home.protect;

  const [outAt, setOutAt] = useState(s.roll_out_at);
  const [upAt, setUpAt] = useState(s.roll_up_at);

  // Keep the inputs in step when the backend is the one that changed them.
  useEffect(() => setOutAt(s.roll_out_at), [s.roll_out_at]);
  useEffect(() => setUpAt(s.roll_up_at), [s.roll_up_at]);

  const onCount = [home.auto_water, s.enabled, p.auto].filter(Boolean).length;

  return (
    <details className="card fold">
      <summary>
        Automatic
        <span className="hint">
          {onCount === 0 ? "all off" : `${onCount} of 3 on`}
        </span>
      </summary>

      <div className="sub">
        <div className="toggle">
          <span>
            Water the sheet by itself
            <br />
            <span className="muted-line">
              Tops it up below {Math.round(home.water_threshold_pct ?? 30)}%
            </span>
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={home.auto_water}
            aria-label="Water the sheet by itself"
            disabled={busy}
            onClick={() => onAuto(!home.auto_water)}
          />
        </div>
      </div>

      <div className="sub">
        <div className="toggle">
          <span>
            Roll on a schedule
            <br />
            <span className="muted-line">Out before the sun, up in the evening</span>
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={s.enabled}
            aria-label="Roll on a schedule"
            disabled={busy}
            onClick={() => onSchedule({ enabled: !s.enabled })}
          />
        </div>

        {s.enabled && (
          <div className="times">
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
      </div>

      <div className="sub">
        <div className="toggle">
          <span>
            Roll up in rough weather
            <br />
            <span className="muted-line">
              Gusts over {Math.round(p.wind_gust_kmh)} km/h. Off means we warn you
              instead.
            </span>
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

        {p.forecast_source !== "live" && (
          <p className="tiny">
            {p.forecast_source === "cache"
              ? "Forecast is from the last successful update, not live."
              : "Showing a sample forecast — no weather data reached this device."}
          </p>
        )}
      </div>
    </details>
  );
}
