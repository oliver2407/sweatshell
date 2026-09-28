import { fmt } from "../api.js";

/*
 * Inside the house.
 *
 * The comparison against an uncovered roof is gone from this screen. In a real home
 * there is no second roof to compare against, and the honest version of that number
 * needs a week of baseline data before it means anything. What a person can act on
 * is the temperature they are actually living in.
 */

const TONE = {
  good: "var(--status-good)",
  low: "var(--status-warning)",
  dry: "var(--status-critical)",
  parked: "var(--text-muted)",
  unknown: "var(--status-critical)",
};

export default function IndoorCard({ home }) {
  return (
    <div className="card">
      <h2>Inside your home</h2>

      <div className="big">
        {fmt(home.inside_c, 0)}
        <span className="unit">°C</span>
      </div>

      <div className="pair">
        <div>
          <div className="k">Humidity inside</div>
          <div className="v">
            {fmt(home.inside_humidity, 0)}
            <span className="unit">%</span>
          </div>
        </div>
        <div>
          <div className="k">Outside</div>
          <div className="v">
            {fmt(home.outside_c, 0)}
            <span className="unit">°C</span>
          </div>
        </div>
      </div>

      <div className="status-line">
        <span className="dot" style={{ background: TONE[home.status] }} />
        <span>{home.advice}</span>
      </div>
    </div>
  );
}
