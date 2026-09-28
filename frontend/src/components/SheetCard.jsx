/*
 * The roller.
 *
 * The sheet rolls down over the roof to cool, and rolls back up when it is not
 * wanted. The app reports where the sheet actually is, not where it was asked to be:
 * the button sends a request, the roller reports back, and the label only changes
 * once the roller says it moved.
 */

export default function SheetCard({ home, busy, onMove }) {
  const out = home.sheet_out;

  return (
    <div className="card">
      <h2>The sheet</h2>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width="62" height="62" viewBox="0 0 62 62" aria-hidden="true">
          {/* roller */}
          <circle
            cx="31"
            cy="12"
            r="8"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2.5"
          />
          {/* the sheet hanging down, or wound up */}
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
            {out ? "Rolled out over the roof" : "Rolled up"}
          </strong>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 2 }}>
            {out
              ? "Covering the roof and cooling."
              : "Off the roof. Nothing is cooling while it is up."}
          </div>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn" disabled={busy} onClick={() => onMove(!out)}>
          {out ? "Roll it up" : "Roll it out"}
        </button>
      </div>
    </div>
  );
}
