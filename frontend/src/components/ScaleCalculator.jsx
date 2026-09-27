import { useState } from "react";
import { api, fmt } from "../api.js";

/*
 * "Would this work on a real roof?"
 *
 * The first serious objection to SweatShell is water use in a dry country, and the
 * only honest reply is arithmetic from the rig's own measurement. This panel is
 * allowed to return a bad answer: if a 5,000 L tank does not cover the season, it
 * says so, in red, with the number.
 */

export default function ScaleCalculator() {
  const [q, setQ] = useState({
    roof_area_m2: 30,
    tank_litres: 5000,
    hot_days_per_year: 10,
    hours_per_hot_day: 8,
  });
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k) => (e) => setQ({ ...q, [k]: Number(e.target.value) });

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      setOut(await api.scale(q));
    } catch (e) {
      setErr(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const p = out?.projected;
  const enough = p?.tank_is_enough;

  return (
    <div className="card">
      <h2>Scale it to a real roof</h2>
      <div className="grid cols-2" style={{ marginBottom: 12, gap: 12 }}>
        <label className="field">
          Roof area (m²)
          <input type="number" value={q.roof_area_m2} onChange={set("roof_area_m2")} />
        </label>
        <label className="field">
          Rainwater tank (L)
          <input type="number" value={q.tank_litres} onChange={set("tank_litres")} />
        </label>
        <label className="field">
          Extreme-heat days per year
          <input
            type="number"
            value={q.hot_days_per_year}
            onChange={set("hot_days_per_year")}
          />
        </label>
        <label className="field">
          Hours running per hot day
          <input
            type="number"
            value={q.hours_per_hot_day}
            onChange={set("hours_per_hot_day")}
          />
        </label>
      </div>

      <button className="btn primary" onClick={run} disabled={busy}>
        {busy ? "Calculating…" : "Project from measured data"}
      </button>

      {err && (
        <p className="note" style={{ color: "var(--status-critical)" }}>
          {err}
        </p>
      )}

      {out && out.ready === false && (
        <p className="note" style={{ marginTop: 12 }}>
          {out.message}
        </p>
      )}

      {p && (
        <>
          <table className="data" style={{ marginTop: 14 }}>
            <tbody>
              <tr>
                <th>Measured on the rig</th>
                <td>
                  {fmt(out.measured.litres_per_m2_per_hour, 3)} L per m² per hour
                  <span className="foot"> (over {fmt(out.measured.hours, 2)} h)</span>
                </td>
              </tr>
              <tr>
                <th>Per extreme-heat day</th>
                <td>{fmt(p.litres_per_hot_day, 0)} L</td>
              </tr>
              <tr>
                <th>Per season</th>
                <td>{fmt(p.litres_per_season, 0)} L</td>
              </tr>
              <tr>
                <th>A {fmt(p.tank_litres, 0)} L tank covers</th>
                <td>{fmt(p.tank_covers_hot_days, 1)} hot days</td>
              </tr>
            </tbody>
          </table>

          <div
            className="pill"
            style={{
              marginTop: 12,
              color: enough ? "var(--success-text)" : "var(--status-critical)",
              borderColor: enough ? "var(--success-text)" : "var(--status-critical)",
            }}
          >
            <span
              className="dot"
              style={{
                background: enough ? "var(--status-good)" : "var(--status-critical)",
              }}
            />
            {enough
              ? "The tank covers the season"
              : "The tank does not cover a full season"}
          </div>

          <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
            {out.note}
          </p>
        </>
      )}
    </div>
  );
}
