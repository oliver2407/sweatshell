import { fmt } from "../api.js";
import Dial from "./Dial.jsx";
import { RollOut, RollUp, Clock } from "./icons.jsx";

/*
 * The control tab. Everything here fits one phone screen without scrolling, because
 * this is the screen people open twenty times a week and close again.
 *
 * Three modes across the top, matching how the sheet actually gets moved: by hand in
 * either direction, or left to the clock. Auto is a mode rather than a buried setting
 * because it is mutually exclusive with deciding by hand — pressing Roll up while a
 * schedule is running would hand control back for all of ten minutes.
 */

function hhmmTo12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** One line saying who is deciding, and what happens next. */
function modeSentence(home) {
  // The roof unit's own thresholds come first: they are the primary way this runs,
  // they trigger on the air outside — which leads the heat rather than lagging it —
  // and while they are on nothing else touches the sheet.
  if (home.device?.mode === "auto") {
    const s = home.device.settings;
    return s
      ? `The roof unit is deciding — out above ${s.hot}°C outside, up below ${s.cool}°C.`
      : "The roof unit is deciding from the temperature outside.";
  }

  if (!home.schedule.enabled) {
    return home.sheet_out
      ? "You’re deciding. The sheet stays out until you move it."
      : "You’re deciding. The sheet stays up until you move it.";
  }

  const next = home.schedule.next_change;
  if (!next) return "On a schedule, but nothing is set to run.";

  // A monthly time can be weeks out, so "tomorrow" is not a safe stand-in for
  // "not today" — past that, name the day.
  const day =
    next.days_away === 0
      ? ""
      : next.days_away === 1
        ? " tomorrow"
        : ` on ${new Date(next.date + "T00:00:00").toLocaleDateString([], {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}`;
  const when = `${hhmmTo12(next.at)}${day}`;
  const verb = next.to === "out" ? "rolling out" : "rolling up";

  // After a manual move, the sheet is not where the schedule wants it. Saying so is
  // better than pretending, and it tells the person exactly when it goes back.
  const held = home.schedule.wants_out !== home.sheet_out;
  return held
    ? `Held ${home.sheet_out ? "out" : "up"} by you. Back on schedule at ${when}.`
    : `On a schedule — ${verb} at ${when}.`;
}

export default function ControlTab({ home, busy, onMove, onMode, onWater, wide }) {
  const out = home.sheet_out;
  // Auto means the roof unit's own temperature thresholds are driving. The clock
  // schedule is the other option and lives on its own tab; it stands down while
  // this is on.
  const auto = home.device?.mode === "auto";
  const watering = home.pump_on || home.pump_queued;

  return (
    <>
      <div className="modes">
        <button
          className="mode"
          aria-pressed={out && !auto}
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(true)}
        >
          <span className="ring">
            <RollOut />
          </span>
          <span className="label">Roll out</span>
        </button>

        <button
          className="mode"
          aria-pressed={!out && !auto}
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(false)}
        >
          <span className="ring">
            <RollUp />
          </span>
          <span className="label">Roll up</span>
        </button>

        <button
          className="mode"
          aria-pressed={auto}
          disabled={busy || !home.device?.connected}
          onClick={() => onMode(!auto)}
        >
          <span className="ring">
            <Clock />
          </span>
          <span className="label">Auto</span>
        </button>
      </div>

      {/*
        A mode button that does nothing visible for six hours is a button nobody
        trusts. This line is the promise: turn Auto on and it tells you the next
        thing it will do, by the clock, before it does it.
      */}
      <p className="mode-says">{modeSentence(home)}</p>

      <Dial home={home} size={wide ? 296 : 248} />

      <div className="facts">
        <div className="fact">
          <div className="v">{fmt(home.inside_humidity, 0)}%</div>
          <div className="k">Humidity</div>
        </div>
        <div className="fact">
          <div className="v">{fmt(home.outside_c, 0)}°</div>
          <div className="k">Outside</div>
        </div>
        <div className="fact">
          <div className="v">{fmt(home.litres_used, 1)}L</div>
          <div className="k">Used today</div>
        </div>
      </div>

      <button
        className="act go"
        disabled={busy || watering}
        onClick={onWater}
      >
        {watering ? "Watering…" : "Water now"}
      </button>
    </>
  );
}
