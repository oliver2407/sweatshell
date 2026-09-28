/*
 * Upkeep countdown.
 *
 * The gel softens over months and wants one spray of the setting solution to firm up
 * again. That is the kind of job nobody remembers and nobody has the manual for, so
 * the app carries it.
 *
 * Laid out as a row rather than a tile: the number and its button belong on one
 * line, and stacking them in a narrow column made the task text wrap four times.
 */

export default function MaintenanceCard({ m, busy, onDone }) {
  const overdue = m.overdue;
  const pct = Math.round(m.progress * 100);

  return (
    <div className="card">
      <div className="sheet-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {overdue ? Math.abs(m.days_until_service) : m.days_until_service}
            </span>
            <span style={{ fontSize: 15, color: "var(--text-secondary)" }}>
              {overdue ? "days overdue" : "days to next check"}
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--text-muted)", marginTop: 2 }}>
            {m.task}
          </div>
        </div>

        <button className="btn small auto-w" disabled={busy} onClick={onDone}>
          Just did it
        </button>
      </div>

      <div className="bar" aria-hidden="true">
        <div
          className="barfill"
          style={{
            width: `${Math.max(2, Math.min(100, pct))}%`,
            background: overdue ? "var(--status-warning)" : "var(--series-1)",
          }}
        />
      </div>
    </div>
  );
}
