import { fmt } from "../api.js";

/*
 * The cooling ledger.
 *
 * Every figure here is derived from one measured quantity: grams of water that left
 * the gel. The chain is grams -> kJ -> kWh -> kg CO2, and each division is a place
 * to overstate the result, so the assumptions are printed next to the numbers
 * rather than in a footnote nobody reads.
 *
 * litres_per_degree_per_hour is the important one. It is the answer to "you are
 * pouring water on a roof in a drought country", and we lead with it instead of
 * waiting to be asked.
 */

export default function CoolingCounter({ totals, assumptions }) {
  const t = totals ?? {};
  const cost = t.litres_per_degree_per_hour;

  return (
    <div className="card">
      <h2>What the water bought</h2>
      <div className="tiles">
        <div className="tile">
          <div className="label">Water evaporated</div>
          <div className="value">
            {fmt(t.litres_evaporated, 2)}
            <span className="unit">L</span>
          </div>
          <div className="foot">{fmt(t.grams_evaporated, 0)} g measured by the scale</div>
        </div>
        <div className="tile">
          <div className="label">Heat removed</div>
          <div className="value">
            {fmt(t.heat_removed_kj, 0)}
            <span className="unit">kJ</span>
          </div>
          <div className="foot">grams × 2.45 kJ/g latent heat</div>
        </div>
        <div className="tile">
          <div className="label">AC electricity saved</div>
          <div className="value">
            {fmt(t.ac_kwh_saved, 3)}
            <span className="unit">kWh</span>
          </div>
          <div className="foot">heat ÷ 3600 ÷ COP {assumptions?.assumed_ac_cop ?? 3}</div>
        </div>
        <div className="tile">
          <div className="label">CO₂ avoided</div>
          <div className="value">
            {fmt(t.co2_avoided_kg, 3)}
            <span className="unit">kg</span>
          </div>
          <div className="foot">
            at {assumptions?.grid_kg_co2_per_kwh ?? "—"} kg/kWh grid intensity
          </div>
        </div>
      </div>

      <div
        className="tile"
        style={{ marginTop: 12, borderColor: "var(--baseline)" }}
      >
        <div className="label">Water cost of the cooling</div>
        <div className="value">
          {cost == null ? "—" : fmt(cost, 3)}
          <span className="unit">L per °C per hour</span>
        </div>
        <div className="foot">
          Measured against the gel-vs-coat delta ({fmt(t.mean_sweat_delta_c, 2)} °C mean
          over {fmt(t.hours_elapsed, 2)} h), because the coat costs no water.
        </div>
      </div>

      {assumptions?.notes && (
        <>
          <h2 style={{ marginTop: 16 }}>Assumptions we are making</h2>
          <ul className="plain">
            {assumptions.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
