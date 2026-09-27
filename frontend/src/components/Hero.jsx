import { SERIES_VAR, fmt } from "../api.js";

/*
 * The headline is a stat tile, not a chart: one number, read once.
 *
 * It is split three ways on purpose. "9.5 degrees cooler" is the impressive figure,
 * but most of it comes from the reflective coat, and the gel's own contribution is
 * the smaller number underneath. Hiding that split would be the fastest way to lose
 * a judge who knows how paint works.
 */

export default function Hero({ deltas, ambient }) {
  const total = deltas?.total_delta;
  const reflect = deltas?.reflect_delta;
  const sweat = deltas?.sweat_delta;
  const vsCloth = deltas?.gel_vs_cloth;

  const clothVerdict =
    vsCloth == null
      ? "No wet-cloth control reading yet."
      : vsCloth > 0.5
        ? `The gel is beating a plain wet cloth by ${fmt(vsCloth, 1)} °C.`
        : vsCloth > -0.5
          ? "The gel and a plain wet cloth are within half a degree. Say so out loud — the honest finding is that the cloth was doing the work."
          : `A plain wet cloth is currently beating the gel by ${fmt(Math.abs(vsCloth), 1)} °C.`;

  return (
    <div className="card">
      <h2>Inside air, SweatShell vs bare metal</h2>
      <div className="hero-figure">
        {total == null ? "—" : fmt(total, 1)}
        <span className="unit">°C cooler</span>
      </div>
      <div className="hero-caption">
        Measured right now, not modelled.{" "}
        {ambient != null && `Room air ${fmt(ambient, 1)} °C.`}
      </div>

      <div className="tiles" style={{ marginTop: 18 }}>
        <div className="tile">
          <div className="label">
            <span className="swatch" style={{ background: SERIES_VAR.box2 }} />
            Reflective coat
          </div>
          <div className="value">
            {fmt(reflect, 1)}
            <span className="unit">°C</span>
          </div>
          <div className="foot">Eggshell paint alone. Costs no water.</div>
        </div>
        <div className="tile">
          <div className="label">
            <span className="swatch" style={{ background: SERIES_VAR.box3 }} />
            Sweating gel
          </div>
          <div className="value">
            {fmt(sweat, 1)}
            <span className="unit">°C</span>
          </div>
          <div className="foot">What the gel adds on top. This is our claim.</div>
        </div>
        <div className="tile">
          <div className="label">
            <span className="swatch" style={{ background: SERIES_VAR.box4 }} />
            Gel vs wet cloth
          </div>
          <div className="value">
            {fmt(vsCloth, 1)}
            <span className="unit">°C</span>
          </div>
          <div className="foot">Positive means the gel wins.</div>
        </div>
      </div>

      <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>
        {clothVerdict}
      </p>
    </div>
  );
}
