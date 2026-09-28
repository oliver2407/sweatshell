/*
 * Maintenance countdown.
 *
 * The gel softens over months and wants one spray of the setting solution to firm up
 * again. That is the kind of job nobody remembers and nobody has the manual for, so
 * the app carries it: how long the sheet has been up there, how long until the next
 * check, and a button to reset the clock once it is done.
 */

export default function MaintenanceCard({ m, busy, onDone }) {
  const overdue = m.overdue;
  const pct = Math.round(m.progress * 100);

  return (
    <div className="card">
      <h2>Upkeep</h2>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em" }}>
          {overdue ? Math.abs(m.days_until_service) : m.days_until_service}
        </div>
        <div style={{ fontSize: 15, color: "var(--text-secondary)" }}>
          {overdue ? "days overdue" : "days until the next check"}
        </div>
      </div>

      <div className="bar" aria-hidden="true">
        <div
          className="barfill"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: overdue ? "var(--status-warning)" : "var(--series-1)",
          }}
        />
      </div>

      <p className="sub-note">
        {m.task} On the roof for {m.days_in_service} day
        {m.days_in_service === 1 ? "" : "s"}; checked every {m.interval_days}.
      </p>

      <div className="btn-row">
        <button className="btn" disabled={busy} onClick={onDone}>
          I’ve just done it
        </button>
      </div>
    </div>
  );
}
