import { useEffect, useState } from "react";

/*
 * When the sheet rolls: a list of times, each with its own repeat rule.
 *
 * Shaped like the recurrence editor in a calendar app, because that is the pattern
 * people already know and because a roof genuinely has more than one rhythm. A
 * west-facing roof wants the afternoon only; someone home at lunch wants a gap;
 * "the first of every month" is how a rental inspection gets scheduled.
 *
 * Three repeat modes and no more. Every day, chosen weekdays, chosen dates. "Every
 * third Tuesday" is a calendar feature, not a roof feature, and each extra option
 * is one more thing on screen that has to be read before anything can be set.
 *
 * Called a "time" rather than a "window" on screen. This is an app about a house,
 * and a window is a thing a house already has.
 */

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// One word each. "Days of week" wrapped to two lines once it was the selected,
// bolder one, which made the control taller the moment it was used.
const REPEATS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function hhmmTo12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function repeatPhrase(w) {
  if (w.repeat === "daily") return "every day";
  if (w.repeat === "monthly") {
    const d = (w.dates ?? []).slice().sort((a, b) => a - b);
    if (d.length === 0) return "no dates picked";
    if (d.length === 1) return `the ${ordinal(d[0])} of each month`;
    const last = d[d.length - 1];
    return `the ${d.slice(0, -1).map(ordinal).join(", ")} and ${ordinal(last)} of each month`;
  }
  const days = w.days ?? [];
  if (days.length === 7) return "every day";
  if (days.length === 0) return "no days picked";
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d)))
    return "weekdays";
  if (days.length === 2 && days.includes(5) && days.includes(6)) return "weekends";
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
    `, ${repeatPhrase(w)}.`
  );
}

function rangePhrase(w) {
  if (w.from && w.to) return `${w.from} to ${w.to}`;
  if (w.from) return `From ${w.from}`;
  if (w.to) return `Until ${w.to}`;
  return "Runs all year";
}

function Entry({ w, active, busy, onPatch, onDelete }) {
  const [outAt, setOutAt] = useState(w.out_at);
  const [upAt, setUpAt] = useState(w.up_at);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setOutAt(w.out_at), [w.out_at]);
  useEffect(() => setUpAt(w.up_at), [w.up_at]);

  const repeat = w.repeat ?? "weekly";

  function toggleIn(list, value, field) {
    const next = list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value].sort((a, b) => a - b);
    onPatch({ [field]: next });
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
          aria-label="Use this time"
          disabled={busy}
          onClick={() => onPatch({ enabled: !w.enabled })}
        />
      </div>

      <div className="seg" role="group" aria-label="Repeat">
        {REPEATS.map((r) => (
          <button
            key={r.id}
            className="seg-btn"
            aria-pressed={repeat === r.id}
            disabled={busy}
            onClick={() => onPatch({ repeat: r.id })}
          >
            {r.label}
          </button>
        ))}
      </div>

      {repeat === "weekly" && (
        <div className="days">
          {DAY_LETTERS.map((letter, d) => (
            <button
              key={d}
              className="day"
              aria-pressed={(w.days ?? []).includes(d)}
              aria-label={DAY_NAMES[d]}
              disabled={busy}
              onClick={() => toggleIn(w.days ?? [], d, "days")}
            >
              {letter}
            </button>
          ))}
        </div>
      )}

      {repeat === "monthly" && (
        <>
          <div className="dates">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                className="day"
                aria-pressed={(w.dates ?? []).includes(d)}
                disabled={busy}
                onClick={() => toggleIn(w.dates ?? [], d, "dates")}
              >
                {d}
              </button>
            ))}
          </div>
          {(w.dates ?? []).some((d) => d > 28) && (
            <p className="win-says">
              A month without that date is skipped, not moved to the day before.
            </p>
          )}
        </>
      )}

      <p className="win-says">
        {describe(w)}
        {active && <span className="now"> Running now.</span>}
      </p>

      {/*
        Remove sits here in the open, beside the dates. It used to be tucked inside
        the date panel, which meant finding it required opening something unrelated
        first — and someone who wants a schedule gone should not have to go looking
        for permission to delete it.
      */}
      {confirming ? (
        <div className="confirm">
          <span>Remove this time?</span>
          <button className="link" onClick={() => setConfirming(false)}>
            Keep it
          </button>
          <button className="link danger" disabled={busy} onClick={onDelete}>
            Remove
          </button>
        </div>
      ) : (
        <div className="win-foot">
          <button className="link" onClick={() => setOpen(!open)}>
            {rangePhrase(w)}
          </button>
          <button className="link danger" onClick={() => setConfirming(true)}>
            Remove
          </button>
        </div>
      )}

      {open && !confirming && (
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
    </div>
  );
}

export default function ScheduleList({ schedule, busy, onPatch, onAdd, onDelete }) {
  const windows = schedule.windows ?? [];

  return (
    <>
      {windows.map((w) => (
        <Entry
          key={w.id}
          w={w}
          active={schedule.active_window_id === w.id}
          busy={busy}
          onPatch={(patch) => onPatch(w.id, patch)}
          onDelete={() => onDelete(w.id)}
        />
      ))}

      {windows.length === 0 && (
        <p className="win-says" style={{ padding: "12px 0 0" }}>
          Nothing set yet. Add a time and the sheet will move on its own.
        </p>
      )}

      <div className="win-group-end">
        <button className="mini wide" disabled={busy} onClick={onAdd}>
          Add a time
        </button>
      </div>
    </>
  );
}
