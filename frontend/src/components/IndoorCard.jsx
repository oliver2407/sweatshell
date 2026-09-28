import { fmt } from "../api.js";

/*
 * The two numbers someone opens the app for, side by side at the top.
 *
 * Each is a stat tile: a label, one big number, one word of state. The controls and
 * the detail that used to live in these cards moved down the page, because a number
 * you check ten times a day should not be under a button you press once a week.
 */

const TONE = {
  good: "var(--status-good)",
  low: "var(--status-warning)",
  dry: "var(--status-critical)",
  parked: "var(--text-muted)",
  unknown: "var(--status-critical)",
};

export function IndoorTile({ home }) {
  const c = home.inside_c;
  // Named against the thresholds in the README: WHO's 18-24 band, and CIBSE's 26 for
  // a bedroom. Words, not a colour alone.
  const state =
    c == null
      ? { label: "No reading", tone: "var(--status-critical)" }
      : c >= 28
        ? { label: "Hot", tone: "var(--status-critical)" }
        : c >= 26
          ? { label: "Warm", tone: "var(--status-warning)" }
          : c >= 18
            ? { label: "Comfortable", tone: "var(--status-good)" }
            : { label: "Cool", tone: "var(--text-muted)" };

  return (
    <div className="card stat half">
      <h2>Inside</h2>
      <div className="big">
        {fmt(c, 0)}
        <span className="unit">°C</span>
      </div>
      <div className="sub-line">
        {fmt(home.inside_humidity, 0)}% humidity · {fmt(home.outside_c, 0)}°C outside
      </div>
      <div className="state">
        <span className="dot" style={{ background: state.tone, marginTop: 0 }} />
        {state.label}
      </div>
    </div>
  );
}

export function AdviceBar({ home }) {
  return (
    <div className="card">
      <div className="status-line">
        <span className="dot" style={{ background: TONE[home.status] }} />
        <span>{home.advice}</span>
      </div>
    </div>
  );
}
