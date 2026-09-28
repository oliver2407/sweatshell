import { useEffect, useMemo, useRef, useState } from "react";
import { clockOf, fmt } from "../api.js";

/*
 * One line: the temperature inside. Shaded behind it: the stretches when the sheet
 * was actually rolled out over the roof.
 *
 * A second line comparing against an uncovered roof would raise a question this
 * screen is not there to answer. The band answers the useful one instead — "was it
 * even on when the house was hot?" — and it answers it at a glance, without asking
 * anyone to read a legend.
 *
 * One measure, one y-axis, 2px stroke, hairline grid. The band is a tint of the same
 * hue as the line, so it reads as context rather than as a second series.
 */

const PAD = { top: 12, right: 46, bottom: 22, left: 32 };

function useWidth(ref, fallback = 360) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Collapse consecutive points where the sheet was out into shaded spans. */
function usageBands(pts) {
  const bands = [];
  let start = null;
  for (let i = 0; i < pts.length; i++) {
    const on = pts[i].sheet_out === true;
    if (on && start === null) start = pts[i].ts;
    if (!on && start !== null) {
      bands.push([start, pts[i].ts]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, pts[pts.length - 1].ts]);
  return bands;
}

export default function InsideChart({ series, height = 180 }) {
  const box = useRef(null);
  const width = useWidth(box);

  const geom = useMemo(() => {
    const pts = series.filter((r) => typeof r.inside_c === "number");
    if (pts.length < 2) return null;

    const t0 = pts[0].ts;
    const t1 = pts[pts.length - 1].ts;
    const vals = pts.map((r) => r.inside_c);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = Math.max(1, (hi - lo) * 0.15);
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);

    const iw = Math.max(60, width - PAD.left - PAD.right);
    const ih = height - PAD.top - PAD.bottom;
    const x = (ts) => PAD.left + ((ts - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => PAD.top + (1 - (v - lo) / Math.max(0.001, hi - lo)) * ih;

    const d = pts
      .map((r, i) => `${i ? "L" : "M"}${x(r.ts).toFixed(1)},${y(r.inside_c).toFixed(1)}`)
      .join(" ");

    return {
      x,
      y,
      lo,
      hi,
      iw,
      ih,
      d,
      t0,
      t1,
      last: pts[pts.length - 1].inside_c,
      bands: usageBands(pts),
      anyBand: pts.some((r) => r.sheet_out === true),
    };
  }, [series, width, height]);

  if (!geom) {
    return (
      <div className="card">
        <h2>Inside, over time</h2>
        <div ref={box} style={{ height, display: "grid", placeItems: "center" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Collecting readings…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Inside, over time</h2>
      <div ref={box}>
        <svg width="100%" height={height} style={{ display: "block" }}>
          {geom.bands.map(([a, b]) => (
            <rect
              key={a}
              x={geom.x(a)}
              y={PAD.top}
              width={Math.max(1, geom.x(b) - geom.x(a))}
              height={geom.ih}
              fill="var(--series-1)"
              opacity="0.1"
            />
          ))}

          {[geom.lo, (geom.lo + geom.hi) / 2, geom.hi].map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={PAD.left + geom.iw}
                y1={geom.y(v)}
                y2={geom.y(v)}
                stroke="var(--gridline)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={geom.y(v) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
              >
                {Math.round(v)}
              </text>
            </g>
          ))}

          <path
            d={geom.d}
            fill="none"
            stroke="var(--series-1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <circle
            cx={geom.x(geom.t1)}
            cy={geom.y(geom.last)}
            r="4"
            fill="var(--series-1)"
            stroke="var(--surface-1)"
            strokeWidth="2"
          />
          <text
            x={PAD.left + geom.iw + 8}
            y={geom.y(geom.last) + 4}
            fontSize="12"
            fontWeight="600"
            fill="var(--text-primary)"
          >
            {fmt(geom.last, 0)}°
          </text>

          <text x={PAD.left} y={height - 5} fontSize="11" fill="var(--text-muted)">
            {clockOf(geom.t0)}
          </text>
          <text
            x={PAD.left + geom.iw}
            y={height - 5}
            textAnchor="end"
            fontSize="11"
            fill="var(--text-muted)"
          >
            {clockOf(geom.t1)}
          </text>
        </svg>
      </div>

      <div className="key">
        <span className="keyband" />
        <span>
          {geom.anyBand
            ? "Shaded = the sheet was rolled out over the roof"
            : "The sheet has not been rolled out during this stretch"}
        </span>
      </div>
    </div>
  );
}
