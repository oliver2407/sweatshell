import { fmt } from "../api.js";

/*
 * Water level, as a tile beside the indoor temperature.
 *
 * Phrased as a battery, because that is how it behaves: it drains while the sheet is
 * cooling and needs topping up. "Sodium alginate hydration" is the right words and
 * the wrong screen.
 *
 * The little face is readable at arm's length in sunlight, but it never carries the
 * state on its own — the percentage and the words say the same thing.
 */

function mood(pct, sheetOut, stale) {
  if (stale || pct == null)
    return { label: "No reading", tone: "var(--status-critical)" };
  // A full sheet that is rolled up is not cooling anything, and saying "Cooling"
  // while the roller sits parked is the sort of small lie that costs trust.
  if (!sheetOut) return { label: "Rolled up", tone: "var(--text-muted)" };
  if (pct >= 70) return { label: "Full", tone: "var(--status-good)" };
  if (pct >= 40) return { label: "Cooling", tone: "var(--status-good)" };
  if (pct >= 20) return { label: "Getting low", tone: "var(--status-warning)" };
  return { label: "Empty", tone: "var(--status-critical)" };
}

export default function WaterCard({ home, busy, onWater }) {
  const pct = home.water_pct;
  const m = mood(pct, home.sheet_out, home.stale);
  const h = 52;
  const fill = ((pct ?? 0) / 100) * h;
  const wet = (pct ?? 0) > 40;
  const low = (pct ?? 0) < 20;
  const watering = home.pump_on || home.pump_queued;

  return (
    <div className="card stat half">
      <h2>Water</h2>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div className="big" style={{ flex: 1 }}>
          {fmt(pct, 0)}
          <span className="unit">%</span>
        </div>

        <svg width="40" height="58" viewBox="0 0 40 58" aria-hidden="true">
          <clipPath id="wclip">
            <rect x="2" y="3" width="36" height={h} rx="8" />
          </clipPath>
          <g clipPath="url(#wclip)">
            <rect
              x="2"
              y={3 + (h - fill)}
              width="36"
              height={fill}
              fill="var(--series-1)"
              opacity="0.22"
            />
            <rect
              x="2"
              y={3 + (h - fill)}
              width="36"
              height="1.5"
              fill="var(--series-1)"
            />
          </g>
          <rect
            x="2"
            y="3"
            width="36"
            height={h}
            rx="8"
            fill="none"
            stroke="var(--baseline)"
            strokeWidth="1.5"
          />
          <circle cx="14" cy="24" r="2.4" fill="var(--text-primary)" />
          <circle cx="26" cy="24" r="2.4" fill="var(--text-primary)" />
          <path
            d={low ? "M14 37 Q20 31 26 37" : wet ? "M14 33 Q20 41 26 33" : "M14 35 H26"}
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="sub-line">{fmt(home.litres_used, 1)} L used today</div>

      <div className="state">
        <span className="dot" style={{ background: m.tone, marginTop: 0 }} />
        {m.label}
      </div>

      <div className="btn-row">
        <button className="btn small" disabled={busy || watering} onClick={onWater}>
          {watering ? "Watering…" : "Water now"}
        </button>
      </div>
    </div>
  );
}
