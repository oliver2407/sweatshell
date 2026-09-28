import { fmt } from "../api.js";

/*
 * Everything worth knowing, in one card at the top.
 *
 * Someone opening this app on the way home wants four facts and one sentence: how
 * warm it is inside, how much water is left, where the sheet is, and whether they
 * need to do anything. Spreading those across three cards meant scrolling to find
 * out whether anything was wrong.
 */

const TONE = {
  good: "var(--status-good)",
  low: "var(--status-warning)",
  dry: "var(--status-critical)",
  parked: "var(--text-muted)",
  unknown: "var(--status-critical)",
};

function waterTone(pct, sheetOut, stale) {
  if (stale || pct == null) return "var(--status-critical)";
  if (!sheetOut) return "var(--text-muted)";
  if (pct < 20) return "var(--status-critical)";
  if (pct < 40) return "var(--status-warning)";
  return "var(--status-good)";
}

export default function StatusCard({ home }) {
  const pct = home.water_pct;
  const wet = (pct ?? 0) > 40;
  const low = (pct ?? 0) < 20;
  const h = 46;
  const fill = ((pct ?? 0) / 100) * h;

  return (
    <div className="card">
      <h2>Inside your home</h2>

      <div className="hero-row">
        <div className="big">
          {fmt(home.inside_c, 0)}
          <span className="unit">°C</span>
        </div>

        <div className="water-mini">
          {/* Small enough to sit beside the temperature, still readable at arm's
              length. The face never carries the state alone — the number and the
              colour dot say the same thing. */}
          <svg width="38" height="54" viewBox="0 0 38 54" aria-hidden="true">
            <clipPath id="miniclip">
              <rect x="2" y="4" width="34" height={h} rx="7" />
            </clipPath>
            <g clipPath="url(#miniclip)">
              <rect
                x="2"
                y={4 + (h - fill)}
                width="34"
                height={fill}
                fill="var(--series-1)"
                opacity="0.22"
              />
              <rect
                x="2"
                y={4 + (h - fill)}
                width="34"
                height="1.5"
                fill="var(--series-1)"
              />
            </g>
            <rect
              x="2"
              y="4"
              width="34"
              height={h}
              rx="7"
              fill="none"
              stroke="var(--baseline)"
              strokeWidth="1.5"
            />
            <circle cx="13" cy="22" r="2" fill="var(--text-primary)" />
            <circle cx="25" cy="22" r="2" fill="var(--text-primary)" />
            <path
              d={low ? "M13 34 Q19 29 25 34" : wet ? "M13 30 Q19 37 25 30" : "M13 32 H25"}
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <div className="water-pct">
              {fmt(pct, 0)}
              <span className="unit">%</span>
            </div>
            <div className="k">water</div>
          </div>
        </div>
      </div>

      <div className="strip">
        <div>
          <div className="k">Humidity</div>
          <div className="s">{fmt(home.inside_humidity, 0)}%</div>
        </div>
        <div>
          <div className="k">Outside</div>
          <div className="s">{fmt(home.outside_c, 0)}°C</div>
        </div>
        <div>
          <div className="k">Sheet</div>
          <div className="s">
            {home.sheet_moving ? "Moving" : home.sheet_out ? "Out" : "Up"}
          </div>
        </div>
        <div>
          <div className="k">Used today</div>
          <div className="s">{fmt(home.litres_used, 1)} L</div>
        </div>
      </div>

      <div className="status-line">
        <span
          className="dot"
          style={{
            background: home.status === "good" ? waterTone(pct, home.sheet_out, home.stale) : TONE[home.status],
          }}
        />
        <span>{home.advice}</span>
      </div>
    </div>
  );
}
