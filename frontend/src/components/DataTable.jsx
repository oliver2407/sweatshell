import { BOX_KEYS, SERIES_VAR, SHORT_LABEL, clockOf, fmt } from "../api.js";

/*
 * Table view of the same series the chart draws.
 *
 * This is not a nice-to-have. Two of the light-mode series colours sit below 3:1
 * contrast against the chart surface, and the palette's relief rule says a chart in
 * that position must ship either visible direct labels or a table. We ship both.
 * It is also the view a judge who wants to check our arithmetic actually uses.
 */

export default function DataTable({ series, which, rows = 14 }) {
  const shown = series.slice(-rows).reverse();

  if (!shown.length) return <p className="note">No readings yet.</p>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data">
        <thead>
          <tr>
            <th>Time</th>
            {BOX_KEYS.map((k) => (
              <th key={k}>
                <span
                  className="swatch"
                  style={{
                    background: SERIES_VAR[k],
                    display: "inline-block",
                    marginRight: 6,
                    verticalAlign: "middle",
                  }}
                />
                {SHORT_LABEL[k]}
              </th>
            ))}
            <th>Room</th>
            <th>RH</th>
            <th>Gel</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.ts}>
              <td>{clockOf(r.ts)}</td>
              {BOX_KEYS.map((k) => (
                <td key={k}>{fmt(r[which]?.[k], 1)}</td>
              ))}
              <td>{fmt(r.ambient_c, 1)}</td>
              <td>{fmt(r.humidity, 0)}%</td>
              <td>{fmt(r.water_pct, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
        Last {shown.length} readings, newest first. All temperatures in °C. Full run
        available as CSV.
      </p>
    </div>
  );
}
