import { fmt } from "../api.js";

/*
 * Water level.
 *
 * Phrased as a battery, because that is what it behaves like: it drains while the
 * sheet is cooling, and it needs topping up. "Sodium alginate hydration" is the
 * right words and the wrong screen.
 *
 * The face is readable at arm's length in sunlight. It never carries the state on
 * its own — the percentage and the words say the same thing.
 */

function mood(pct) {
  if (pct == null) return { label: "No reading", tone: "var(--status-critical)" };
  if (pct >= 70) return { label: "Full", tone: "var(--status-good)" };
  if (pct >= 40) return { label: "Cooling", tone: "var(--status-good)" };
  if (pct >= 20) return { label: "Getting low", tone: "var(--status-warning)" };
  return { label: "Empty", tone: "var(--status-critical)" };
}

export default function WaterCard({ home, busy, onWater, onAuto }) {
  const pct = home.water_pct;
  const m = mood(pct);
  const h = 104;
  const fill = ((pct ?? 0) / 100) * h;
  const wet = (pct ?? 0) > 40;
  const low = (pct ?? 0) < 20;

  return (
    <div className="card">
      <h2>Water</h2>

      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <svg width="86" height="122" viewBox="0 0 86 122" aria-hidden="true">
          <clipPath id="sheetclip">
            <rect x="5" y="9" width="76" height={h} rx="13" />
          </clipPath>
          <g clipPath="url(#sheetclip)">
            <rect
              x="5"
              y={9 + (h - fill)}
              width="76"
              height={fill}
              fill="var(--series-1)"
              opacity="0.22"
            />
            <rect
              x="5"
              y={9 + (h - fill)}
              width="76"
              height="2"
              fill="var(--series-1)"
            />
          </g>
          <rect
            x="5"
            y="9"
            width="76"
            height={h}
            rx="13"
            fill="none"
            stroke="var(--baseline)"
            strokeWidth="2"
          />
          <circle cx="31" cy="48" r="4" fill="var(--text-primary)" />
          <circle cx="55" cy="48" r="4" fill="var(--text-primary)" />
          <path
            d={
              low
                ? "M31 74 Q43 64 55 74"
                : wet
                  ? "M30 68 Q43 81 56 68"
                  : "M31 72 H55"
            }
            fill="none"
            stroke="var(--text-primary)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {wet && (
            <path d="M70 19 q4 7 0 10 q-4-3 0-10z" fill="var(--series-1)" />
          )}
        </svg>

        <div>
          <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: "-0.03em" }}>
            {fmt(pct, 0)}
            <span style={{ fontSize: 19, color: "var(--text-secondary)" }}>%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dot" style={{ background: m.tone, marginTop: 0 }} />
            <strong style={{ fontSize: 15 }}>{m.label}</strong>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
            {fmt(home.litres_used, 1)} L used today
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn primary"
          disabled={busy || home.pump_on || home.pump_queued}
          onClick={onWater}
        >
          {home.pump_on || home.pump_queued ? "Watering…" : "Water now"}
        </button>
      </div>

      <div className="toggle">
        <span>Water automatically</span>
        <button
          className="switch"
          role="switch"
          aria-checked={home.auto_water}
          aria-label="Water automatically"
          disabled={busy}
          onClick={() => onAuto(!home.auto_water)}
        />
      </div>
    </div>
  );
}
