/*
 * The sheet: where it is, and the button that moves it.
 *
 * Everything automatic moved into its own section further down. The button is here
 * on its own because it is the one control a person reaches for in the moment, and
 * it should never be two taps behind a settings panel.
 */

export default function SheetCard({ home, busy, onMove }) {
  const out = home.sheet_out;

  return (
    <div className="card">
      <div className="sheet-row">
        <svg width="46" height="46" viewBox="0 0 62 62" aria-hidden="true">
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

        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 16 }}>
            {home.sheet_moving ? "Moving…" : out ? "Rolled out over the roof" : "Rolled up"}
          </strong>
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 1 }}>
            {out ? "Covering the roof and cooling." : "Off the roof, not cooling."}
          </div>
        </div>

        <button
          className="btn small auto-w"
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(!out)}
        >
          {out ? "Roll up" : "Roll out"}
        </button>
      </div>
    </div>
  );
}
