import { fmt } from "../api.js";

/*
 * Gel water level.
 *
 * The face is not a joke: a judge standing three metres away can read "the roof is
 * thirsty" off an expression faster than off a number, and the number is right
 * there underneath for anyone who wants it. Colour never carries the state alone —
 * the mouth shape, the label, and the percentage all say the same thing.
 */

const STATES = [
  { min: 70, label: "Sweating", mouth: "smile", tone: "var(--status-good)" },
  { min: 40, label: "Working", mouth: "flat", tone: "var(--status-good)" },
  { min: 20, label: "Getting thirsty", mouth: "frown", tone: "var(--status-warning)" },
  { min: -1, label: "Dry — not cooling", mouth: "dry", tone: "var(--status-critical)" },
];

function faceFor(pct) {
  return STATES.find((s) => pct > s.min) ?? STATES[STATES.length - 1];
}

export default function WaterGauge({ pct, massG, pumpOn, pumpQueued, humidity }) {
  const level = pct ?? 0;
  const state = faceFor(level);
  const h = 118; // pad height in svg units
  const fillH = (level / 100) * h;

  return (
    <div className="card">
      <h2>Gel water level</h2>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <svg width="104" height="140" viewBox="0 0 104 140" aria-hidden="true">
          {/* pad outline */}
          <rect
            x="6"
            y="10"
            width="92"
            height={h}
            rx="14"
            fill="none"
            stroke="var(--baseline)"
            strokeWidth="2"
          />
          {/* water fill, clipped to the pad */}
          <clipPath id="padclip">
            <rect x="6" y="10" width="92" height={h} rx="14" />
          </clipPath>
          <g clipPath="url(#padclip)">
            <rect
              x="6"
              y={10 + (h - fillH)}
              width="92"
              height={fillH}
              fill="var(--series-3)"
              opacity="0.28"
            />
            <rect
              x="6"
              y={10 + (h - fillH)}
              width="92"
              height="2"
              fill="var(--series-3)"
            />
          </g>
          {/* eyes */}
          <circle cx="38" cy="54" r="4.5" fill="var(--text-primary)" />
          <circle cx="66" cy="54" r="4.5" fill="var(--text-primary)" />
          {/* mouth */}
          {state.mouth === "smile" && (
            <path
              d="M36 76 Q52 90 68 76"
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          {state.mouth === "flat" && (
            <path
              d="M37 80 H67"
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          {state.mouth === "frown" && (
            <path
              d="M36 84 Q52 72 68 84"
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          {state.mouth === "dry" && (
            <path
              d="M38 84 Q52 70 66 84 Q52 78 38 84"
              fill="none"
              stroke="var(--text-primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
          {/* a sweat drop, only while it is actually sweating */}
          {level > 40 && (
            <path
              d="M86 22 q5 8 0 11 q-5-3 0-11z"
              fill="var(--series-3)"
              opacity="0.9"
            />
          )}
        </svg>

        <div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em" }}>
            {fmt(pct, 0)}
            <span style={{ fontSize: 17, color: "var(--text-secondary)" }}>%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
            <span className="dot" style={{ background: state.tone }} />
            <strong style={{ fontSize: 14 }}>{state.label}</strong>
          </div>
          <div className="note" style={{ marginTop: 8 }}>
            {massG != null ? `${fmt(massG, 0)} g on the scale` : "No load cell reading"}
            <br />
            {humidity != null ? `Room humidity ${fmt(humidity, 0)}%` : ""}
          </div>
          {(pumpOn || pumpQueued) && (
            <div className="pill" style={{ marginTop: 8 }}>
              <span className="dot" style={{ background: "var(--status-good)" }} />
              {pumpOn ? "Pump running" : "Watering queued"}
            </div>
          )}
        </div>
      </div>
      <p className="note" style={{ marginTop: 12, marginBottom: 0 }}>
        Evaporative cooling stops when the pad runs dry. That is the whole reason this
        needs a sensor rather than a schedule.
      </p>
    </div>
  );
}
