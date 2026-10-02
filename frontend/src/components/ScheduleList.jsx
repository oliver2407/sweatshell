import { useEffect, useState } from "react";

/*
 * The schedule: a list of windows rather than one pair of times.
 *
 * A day is not one shape. A west-facing roof wants the sheet out for the afternoon
 * only, someone home at lunch wants a gap in the middle, and a shoulder-season week
 * wants it out three days in five. Each row here is one window with its own days and
 * an optional end date, so "every afternoon until the end of October" is one row and
 * not a reminder in someone's phone.
 *
 * Each row states what it does in a sentence under the times, because "06:45–20:15,
 * Mon Tue Wed" is a specification and "Out at 6:45 am, up at 8:15 pm, weekdays" is
 * an answer.
 */

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hhmmTo12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function daysPhrase(days) {
  if (days.length === 7) return "every day";
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d)))
    return "weekdays";
  if (days.length === 2 && days.includes(5) && days.includes(6)) return "weekends";
  if (days.length === 0) return "no days selected";
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(", ");
}

function describe(w) {
  const overnight = w.out_at > w.up_at;
  return (
    `Out at ${hhmmTo12(w.out_at)}, up at ${hhmmTo12(w.up_at)}` +
    (overnight ? " the next morning" : "") +
    `, ${daysPhrase(w.days)}.`
  );
}

function dateRangePhrase(w) {
  if (w.from && w.to) return `From ${w.from} to ${w.to}`;
  if (w.from) return `From ${w.from}`;
  if (w.to) return `Until ${w.to}`;
  return null;
}

function Window({ w, active, busy, onPatch, onDelete }) {
  const [outAt, setOutAt] = useState(w.out_at);
  const [upAt, setUpAt] = useState(w.up_at);
  const [open, setOpen] = useState(false);

  useEffect(() => setOutAt(w.out_at), [w.out_at]);
  useEffect(() => setUpAt(w.up_at), [w.up_at]);

  function toggleDay(d) {
    const days = w.days.includes(d)
      ? w.days.filter((x) => x !== d)
      : [...w.days, d].sort((a, b) => a - b);
    onPatch({ days });
  }

  return (
    <div className={`win${w.enabled ? "" : " off"}`}>
      <div className="win-head">
        <div className="win-times">
          <input
            type="time"
            value={outAt}
            disabled={busy}
            aria-label="Roll out at"
            onChange={(e) => setOutAt(e.target.value)}
            onBlur={() => outAt !== w.out_at && onPatch({ out_at: outAt })}
          />
          <span className="win-dash">to</span>
          <input
            type="time"
            value={upAt}
            disabled={busy}
            aria-label="Roll up at"
            onChange={(e) => setUpAt(e.target.value)}
            onBlur={() => upAt !== w.up_at && onPatch({ up_at: upAt })}
          />
        </div>
        <button
          className="switch sm"
          role="switch"
          aria-checked={w.enabled}
          aria-label="Use this window"
          disabled={busy}
          onClick={() => onPatch({ enabled: !w.enabled })}
        />
      </div>

      <div className="days">
        {DAY_LETTERS.map((letter, d) => (
          <button
            key={d}
            className="day"
            aria-pressed={w.days.includes(d)}
            aria-label={DAY_NAMES[d]}
            disabled={busy}
            onClick={() => toggleDay(d)}
          >
            {letter}
          </button>
        ))}
      </div>

      <p className="win-says">
        {describe(w)}
        {active && <span className="now"> Running now.</span>}
      </p>

      <button className="link" onClick={() => setOpen(!open)}>
        {dateRangePhrase(w) ?? "Runs all year"}
      </button>

      {open && (
        <div className="times">
          <label>
            Start date
            <input
              type="date"
              value={w.from ?? ""}
              disabled={busy}
              onChange={(e) => onPatch({ date_from: e.target.value })}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={w.to ?? ""}
              disabled={busy}
              onChange={(e) => onPatch({ date_to: e.target.value })}
            />
          </label>
        </div>
      )}

      {open && (
        <button className="link danger" disabled={busy} onClick={onDelete}>
          Remove this window
        </button>
      )}
    </div>
  );
}

export default function ScheduleList({ schedule, busy, onPatch, onAdd, onDelete }) {
  const windows = schedule.windows ?? [];

  return (
    <>
      {windows.map((w) => (
        <Window
          key={w.id}
          w={w}
          active={schedule.active_window_id === w.id}
          busy={busy}
          onPatch={(patch) => onPatch(w.id, patch)}
          onDelete={() => onDelete(w.id)}
        />
      ))}

      {windows.length === 0 && (
        <p className="win-says" style={{ padding: "4px 0 10px" }}>
          No windows yet. Add one and the sheet will move on its own.
        </p>
      )}

      <div className="win-group-end">
        <button className="mini wide" disabled={busy} onClick={onAdd}>
          Add a window
        </button>
      </div>
    </>
  );
}
