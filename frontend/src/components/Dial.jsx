import { fmt } from "../api.js";

/*
 * The dial.
 *
 * Two facts in one shape: the ring is how much water is left, the number in the
 * middle is how warm it is inside. They belong together because neither is useful
 * alone — a cool house with an empty sheet is about to stop being cool.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE REFERENCE
 *
 * A thermostat's arc has a knob on the end because the arc is the setpoint and you
 * drag it. Nothing here is a setpoint: the temperature is measured, not chosen, and
 * the water level is a fact about a sheet on a roof. So there is no knob and no drag.
 * An arc that looks draggable and is not would be the screen lying about what it can
 * do, and people would find out by trying.
 *
 * The scale runs 270 degrees with the gap at the bottom, which is the one place a
 * reading never has to be read upside down.
 */

const STROKE = 13;
const START = 135; // degrees, clockwise from 3 o'clock
const SWEEP = 270;

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, r, fromDeg, toDeg) {
  const [x1, y1] = polar(cx, cy, r, fromDeg);
  const [x2, y2] = polar(cx, cy, r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

function waterWord(pct, sheetOut, stale) {
  if (stale || pct == null) return { label: "No reading", tone: "var(--crit)" };
  if (!sheetOut) return { label: "Rolled up", tone: "var(--ink-faint)" };
  if (pct >= 70) return { label: "Full", tone: "var(--good)" };
  if (pct >= 40) return { label: "Cooling", tone: "var(--good)" };
  if (pct >= 20) return { label: "Getting low", tone: "var(--warn)" };
  return { label: "Empty", tone: "var(--crit)" };
}

export default function Dial({ home, size = 248 }) {
  const pct = Math.max(0, Math.min(100, home.water_pct ?? 0));
  const known = home.water_pct != null && !home.stale;
  const state = waterWord(home.water_pct, home.sheet_out, home.stale);

  const SIZE = size;
  const c = SIZE / 2;
  const r = c - STROKE / 2 - 2;
  const end = START + (SWEEP * pct) / 100;

  return (
    <div className="dial" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} aria-hidden="true">
        <path
          d={arcPath(c, c, r, START, START + SWEEP)}
          fill="none"
          stroke="var(--track)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {known && pct > 0 && (
          <path
            d={arcPath(c, c, r, START, end)}
            fill="none"
            stroke="var(--gel)"
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        )}
      </svg>

      <div className="dial-centre">
        <div className="reading">
          {fmt(home.inside_c, 0)}
          <span className="deg">°</span>
        </div>
        <div className="dial-sub">
          {known ? `${fmt(home.water_pct, 0)}% water left` : "water level unknown"}
        </div>
        <div className="dial-state" style={{ color: state.tone }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: state.tone,
              display: "inline-block",
            }}
          />
          {state.label}
        </div>
      </div>
    </div>
  );
}
