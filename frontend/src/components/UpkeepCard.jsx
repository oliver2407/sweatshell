/*
 * Upkeep, compressed to a row.
 *
 * The gel softens over months and wants one spray of the setting solution. That is
 * the kind of job nobody remembers and nobody has the manual for, so the app carries
 * it — but it is a once-a-quarter job, so it does not deserve a whole screen. The
 * detail sits behind a disclosure.
 */

export default function UpkeepCard({ m, busy, onDone }) {
  const overdue = m.overdue;
  const pct = Math.round(m.progress * 100);

  return (
    <div className="card">
      <div className="upkeep-row">
        <div>
          <div className="k">{overdue ? "Service overdue" : "Next check"}</div>
          <div className="s big-ish">
            {overdue ? Math.abs(m.days_until_service) : m.days_until_service} days
          </div>
        </div>
        <button className="icon" disabled={busy} onClick={onDone}>
          Just did it
        </button>
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

      <details>
        <summary>What the check involves</summary>
        <p className="sub-note">
          {m.task} On the roof for {m.days_in_service} day
          {m.days_in_service === 1 ? "" : "s"}; checked every {m.interval_days}.
        </p>
      </details>
    </div>
  );
}
