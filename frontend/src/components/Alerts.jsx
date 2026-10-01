/*
 * Alerts, directly under the header.
 *
 * Anything with a date attached belongs at the top of the screen, not three cards
 * down. Being told on Tuesday that the sheet will roll up at 2pm Thursday is
 * useful; finding it out on Thursday is just a log entry. The time matters as much
 * as the day: most rough weather lasts an afternoon, not a whole day.
 */

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

function hourOf(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "Thursday 2 Oct, 2:00 pm–6:00 pm", "Now until 6:00 pm" once it has started, and
// "Clearing" for the hour after, when the sheet should still stay up.
function windowLabel(w) {
  const now = Date.now() / 1000;
  if (now >= w.end) return "Clearing";
  if (now >= w.start) return `Now until ${hourOf(w.end)}`;
  return `${formatDay(w.date)}, ${hourOf(w.start)}–${hourOf(w.end)}`;
}

function warnAdvice(w, auto, sheetOut) {
  if (!sheetOut) return `Keep it rolled up until ${hourOf(w.safe_after)}.`;
  if (auto) return `The sheet will roll itself up around ${hourOf(w.roll_up_by)}.`;
  return `Roll it up by ${hourOf(w.roll_up_by)} so it doesn’t tear.`;
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
            {windowLabel(warn)} — {warn.reason}.
          </strong>{" "}
          {warnAdvice(warn, p.auto, home.sheet_out)}
        </div>
      )}

      {p?.season_over && (
        <div className="card notice-card">
          <strong>The next week is mild.</strong> If the hot season is over, roll
          it up, dry it fully, and store it.
        </div>
      )}
    </>
  );
}
