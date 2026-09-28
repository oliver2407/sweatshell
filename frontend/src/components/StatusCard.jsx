import { fmt } from "../api.js";

/*
 * The answer to "why did I open this app".
 *
 * One number, one sentence about what to do. Everything that explains HOW the number
 * was reached — the energy chain, the assumptions, the control box — lives on the
 * bench, not here. A person checking their roof wants to know whether it is working
 * and whether they need to do anything.
 */

const TONE = {
  good: "var(--status-good)",
  low: "var(--status-warning)",
  dry: "var(--status-critical)",
  parked: "var(--text-muted)",
  unknown: "var(--status-critical)",
};

export default function StatusCard({ home }) {
  const cooler = home.cooler_by_c;

  return (
    <div className="card">
      <h2>Your roof right now</h2>

      <div className="big">
        {cooler == null ? "—" : fmt(cooler, 1)}
        <span className="unit">°C cooler</span>
      </div>
      <div className="said">than the same roof without SweatShell</div>

      <div className="pair">
        <div>
          <div className="k">Inside</div>
          <div className="v">
            {fmt(home.inside_c, 0)}
            <span className="unit">°C</span>
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
