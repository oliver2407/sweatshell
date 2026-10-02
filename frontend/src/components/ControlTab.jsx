import { fmt } from "../api.js";
import Dial from "./Dial.jsx";
import { RollOut, RollUp } from "./icons.jsx";

/*
 * The control tab. Everything here fits one phone screen without scrolling, because
 * this is the screen people open twenty times a week and close again.
 *
 * THREE SEPARATE THINGS, SAID SEPARATELY
 *
 * This screen used to be one row of three buttons — Roll out, Roll up, Auto — with
 * whichever was lit standing in for all of it. That made one highlight answer three
 * different questions, and it answered them badly: with the roof unit deciding, no
 * button was lit for the sheet at all, so the one fact everyone opens this screen
 * for — is the sheet over my roof right now — was missing from the screen exactly
 * when nobody was touching it.
 *
 * So:
 *   1. who is deciding   -> a two-way switch, Manual or Auto, labelled on both sides
 *   2. where the sheet is -> written out in words, from the device's own report,
 *                            never inferred from which control was last pressed
 *   3. what you can do    -> two plain buttons, which take control back when pressed
 *
 * Nothing here reads state off a button's appearance, so nothing goes blank when the
 * roof unit is the one moving the sheet.
 */

function hhmmTo12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Where the sheet is, in words. The device's report is the only source. */
function sheetState(home) {
  if (home.stale) return { label: "Position unknown", tone: "var(--crit)", moving: false };
  if (home.sheet_moving)
    return {
      label: home.sheet_out ? "Rolling up…" : "Rolling out…",
      tone: "var(--warn)",
      moving: true,
    };
  return home.sheet_out
    ? { label: "Out over the roof", tone: "var(--gel)", moving: false }
    : { label: "Rolled up", tone: "var(--ink-dim)", moving: false };
}

/** One line saying what the thing in charge will do next. */
function modeSentence(home) {
  // The roof unit's own thresholds come first: they are the primary way this runs,
  // they trigger on the air outside — which leads the heat rather than lagging it —
  // and while they are on nothing else touches the sheet.
  if (home.device?.mode === "auto") {
    const s = home.device.settings;
    return s
      ? `Out above ${s.hot}° outside, up below ${s.cool}°.`
      : "Deciding from the temperature outside.";
  }

  if (!home.schedule.enabled) return "The sheet stays where you put it.";

  const next = home.schedule.next_change;
  if (!next) return "Nothing is set to run on the schedule.";

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
  const verb = next.to === "out" ? "Rolling out" : "Rolling up";

  // After a manual move, the sheet is not where the schedule wants it. Saying so is
  // better than pretending, and it tells the person exactly when it goes back.
  const held = home.schedule.wants_out !== home.sheet_out;
  return held ? `Held by you. Back on schedule at ${when}.` : `${verb} at ${when}.`;
}

export default function ControlTab({ home, busy, onMove, onMode, onWater, wide }) {
  const out = home.sheet_out;
  // Auto means the roof unit's own temperature thresholds are driving. Manual is
  // everything else — your buttons and, if you set one, the clock.
  const auto = home.device?.mode === "auto";
  const linked = !!home.device?.connected;
  const watering = home.pump_on || home.pump_queued;
  const sheet = sheetState(home);

  return (
    <>
      {/*
        Both sides are always labelled and always visible, so the mode can be read
        without knowing which one is "on" — the thing a single toggle never manages.
      */}
      <div className="who" role="group" aria-label="Who decides">
        <button
          className="who-half"
          aria-pressed={!auto}
          disabled={busy || !linked}
          onClick={() => onMode(false)}
        >
          Manual
        </button>
        <button
          className="who-half"
          aria-pressed={auto}
          disabled={busy || !linked}
          onClick={() => onMode(true)}
        >
          Auto
        </button>
      </div>

      <p className="mode-says">
        {linked ? modeSentence(home) : "Not connected to the roof unit."}
      </p>

      <Dial home={home} size={wide ? 296 : 248} />

      {/*
        Said in words, from the device's report. This line is the answer to the
        question the screen gets opened for, and it is true whoever last moved it.
      */}
      <div className="sheet-is">
        <span className="sheet-k">Sheet</span>
        <span className="sheet-v" style={{ color: sheet.tone }}>
          <span
            className={sheet.moving ? "pip beat" : "pip"}
            style={{ background: sheet.tone }}
          />
          {sheet.label}
        </span>
      </div>

      {/*
        Actions, not state. Pressing either takes control back from the roof unit,
        and the switch above moves to Manual to show that it did — so the button that
        moves the sheet is also the button that explains why the mode changed.
      */}
      <div className="rolls">
        <button
          className="roll"
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(true)}
        >
          <span className="roll-l">
            <RollOut />
            Roll out
          </span>
          {out && <span className="nowtag">now</span>}
        </button>
        <button
          className="roll"
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(false)}
        >
          <span className="roll-l">
            <RollUp />
            Roll up
          </span>
          {!out && <span className="nowtag">now</span>}
        </button>
      </div>

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

      <button className="act go" disabled={busy || watering} onClick={onWater}>
        {watering ? "Watering…" : "Water now"}
      </button>
    </>
  );
}
