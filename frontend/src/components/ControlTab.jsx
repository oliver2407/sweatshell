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

export default function ControlTab({ home, busy, onMove, onSchedule, onWater }) {
  const out = home.sheet_out;
  const auto = home.schedule.enabled;
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
          disabled={busy}
          onClick={() => onSchedule({ enabled: !auto })}
        >
          <span className="ring">
            <Clock />
          </span>
          <span className="label">Schedule</span>
        </button>
      </div>

      <Dial home={home} />

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
