import { useEffect, useState } from "react";

/*
 * The sheet: where it is, and everything that moves it.
 *
 * Three ways it moves, in the order a person reaches for them:
 *
 *   1. The two buttons. Always available, always win.
 *   2. A daily schedule. The sheet's useful moves are slow and predictable — out
 *      before the sun, up in the evening — so a clock is the right controller. A
 *      roof covering takes hours to change the temperature inside, so reacting to an
 *      indoor thermometer would always be acting too late.
 *   3. Protective roll-up from the forecast. Wind that could tear the sheet has to be
 *      acted on before it arrives, and nothing on the roof can see it coming.
 *
 * The forecast warning is shown whether or not automatic mode is on, because being
 * told on Tuesday that the sheet will roll up on Thursday is useful, and being told
 * on Thursday that it already did is just a log entry.
 */

export default function SheetCard({ home, busy, onMove, onSchedule, onProtect }) {
  const out = home.sheet_out;
  const s = home.schedule;
  const p = home.protect;

  const [outAt, setOutAt] = useState(s.roll_out_at);
  const [upAt, setUpAt] = useState(s.roll_up_at);

  // Keep the inputs in step when the backend is the one that changed them.
  useEffect(() => setOutAt(s.roll_out_at), [s.roll_out_at]);
  useEffect(() => setUpAt(s.roll_up_at), [s.roll_up_at]);

  const warn = p.warning;

  return (
    <div className="card">
      <h2>The sheet</h2>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="58" height="58" viewBox="0 0 62 62" aria-hidden="true">
          <circle
            cx="31"
            cy="12"
            r="8"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2.5"
          />
          {out ? (
            <>
              <rect
                x="17"
                y="20"
                width="28"
                height="32"
                rx="2"
                fill="var(--series-1)"
                opacity="0.2"
              />
              <rect
                x="17"
                y="20"
                width="28"
                height="32"
                rx="2"
                fill="none"
                stroke="var(--series-1)"
                strokeWidth="2"
              />
              <line
                x1="17"
                y1="54"
                x2="45"
                y2="54"
                stroke="var(--text-secondary)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </>
          ) : (
            <circle
              cx="31"
              cy="12"
              r="13"
              fill="none"
              stroke="var(--series-1)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}
        </svg>

        <div>
          <strong style={{ fontSize: 17 }}>
            {home.sheet_moving
              ? "Moving…"
              : out
                ? "Rolled out over the roof"
                : "Rolled up"}
          </strong>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 2 }}>
            {out
              ? "Covering the roof and cooling."
              : "Off the roof. Nothing is cooling while it is up."}
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn"
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(!out)}
        >
          {out ? "Roll it up now" : "Roll it out now"}
        </button>
      </div>

      {/* --- daily schedule ------------------------------------------------ */}

      <div className="sub">
        <div className="toggle">
          <span>Move it on a schedule</span>
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

      {/* --- protective roll-up -------------------------------------------- */}

      <div className="sub">
        <div className="toggle">
          <span>
            Roll up by itself in rough weather
            <br />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Gusts over {Math.round(p.wind_gust_kmh)} km/h
            </span>
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={p.auto}
            aria-label="Roll up by itself in rough weather"
            disabled={busy}
            onClick={() => onProtect({ auto: !p.auto })}
          />
        </div>

        {warn && (
          <div className="notice">
            <strong>{formatDay(warn.date)} — {warn.reason}.</strong>{" "}
            {p.auto
              ? "The sheet will roll itself up that morning."
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
              : "Showing a sample forecast — no weather data reached this device."}
          </p>
        )}
      </div>
    </div>
  );
}

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}
