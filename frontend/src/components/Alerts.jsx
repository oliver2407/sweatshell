/*
 * Alerts, directly under the header.
 *
 * Anything with a date attached belongs at the top of the screen, not three cards
 * down. Being told on Tuesday that the sheet will roll up on Thursday is useful;
 * finding it out on Thursday is just a log entry.
 */

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

export default function Alerts({ home, offline }) {
  const p = home?.protect;
  const warn = p?.warning;

  return (
    <>
      {offline && (
        <div className="warnbar">
          <span
            className="dot"
            style={{ background: "var(--status-critical)", marginTop: 0 }}
          />
          Can’t reach your roof. Showing the last reading.
        </div>
      )}

      {warn && (
        <div className="card notice-card">
          <strong>
            {formatDay(warn.date)} — {warn.reason}.
          </strong>{" "}
          {p.auto
            ? "The sheet will roll itself up that morning."
            : "Roll it up before then so it doesn’t tear."}
        </div>
      )}

      {p?.season_over && (
        <div className="card notice-card">
          <strong>The next few days are mild.</strong> If the hot season is over, roll
          it up, dry it fully, and store it.
        </div>
      )}
    </>
  );
}
