/*
 * Upkeep and care.
 *
 * The countdown is the part worth having: the gel softens over months and wants one
 * spray of the setting solution, which is exactly the job nobody remembers and
 * nobody has the manual for. The rules underneath replace the manual.
 */

const RULES = [
  "Plain water only — rain or tap. No soap, no salt, nothing added.",
  "Rain is fine. The sheet does not wash off or dissolve.",
  "Rolled up wet for a day or two is fine. Dry it fully before storing it away for the season.",
  "Gone soft after a few months? One spray of the setting solution firms it up again.",
];

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

/*
 * `compact` drops the care rules. On a wide screen the countdown rides along beside
 * the controls, where it is a live number worth seeing; the rules are reference
 * material that belongs on its own tab rather than padding out a column.
 */
export default function CareTab({ m, busy, onDone, compact }) {
  const pct = Math.round((m?.progress ?? 0) * 100);
  const overdue = m?.overdue;

  return (
    <>
      <div className="panel">
        <div className="row" style={{ minHeight: 0, paddingBottom: 4 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 200, letterSpacing: "-0.02em" }}>
                {overdue ? Math.abs(m.days_until_service) : m.days_until_service}
              </span>
              <span style={{ fontSize: 14.5, color: "var(--ink-dim)" }}>
                {overdue ? "days overdue" : "days to next check"}
              </span>
            </div>
          </div>
          <button className="mini" disabled={busy} onClick={onDone}>
            Just did it
          </button>
        </div>

        <div className="bar-track">
          <div
            className="bar-fill"
            style={{
              width: `${Math.max(2, Math.min(100, pct))}%`,
              background: overdue ? "var(--warn)" : "var(--gel)",
            }}
          />
        </div>

        <p style={{ marginTop: 12 }}>
          {m?.task}
          {m?.good_day && (
            <>
              {" "}
              Good day for it: <strong style={{ color: "var(--ink)" }}>
                {formatDay(m.good_day.date)}
              </strong>{" "}
              ({m.good_day.reason.toLowerCase()}).
            </>
          )}
        </p>
      </div>

      {!compact && <CareRules />}
    </>
  );
}

/*
 * Split out so the dashboard can put the rules under the dial, where the hero
 * column would otherwise trail off into empty field, while the countdown stays
 * beside the chart with the other live numbers.
 */
export function CareRules() {
  return (
    <div className="panel">
      <h2>Looking after it</h2>
      <ul className="care">
        {RULES.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
