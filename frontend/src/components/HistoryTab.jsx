import { useEffect, useMemo, useRef, useState } from "react";
import { clockOf, fmt } from "../api.js";

/*
 * Temperature inside, with the stretches when the sheet was out shaded behind it.
 *
 * One line, because the useful question on this tab is "was it on while the house
 * was hot" and a second line would raise a different one. The shading answers it
 * without asking anyone to read a legend.
 *
 * Drawn against the dark field rather than a chart surface, so the grid and band are
 * white at low alpha instead of the usual greys — the line itself is the same gel
 * aqua as the dial, which keeps one accent doing one job across the whole app.
 */

const PAD = { top: 14, right: 40, bottom: 24, left: 30 };

function useWidth(ref, fallback = 330) {
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
  for (const p of pts) {
    if (p.sheet_out === true && start === null) start = p.ts;
    if (p.sheet_out !== true && start !== null) {
      bands.push([start, p.ts]);
      start = null;
    }
  }
  if (start !== null) bands.push([start, pts[pts.length - 1].ts]);
  return bands;
}

export default function HistoryTab({ series }) {
  const box = useRef(null);
  const width = useWidth(box);
  const height = 210;

  const geom = useMemo(() => {
    const pts = series.filter((r) => typeof r.inside_c === "number");
    if (pts.length < 2) return null;

    const t0 = pts[0].ts;
    const t1 = pts[pts.length - 1].ts;
    const vals = pts.map((r) => r.inside_c);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = Math.max(1, (hi - lo) * 0.18);
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);

    const iw = Math.max(60, width - PAD.left - PAD.right);
    const ih = height - PAD.top - PAD.bottom;
    const x = (ts) => PAD.left + ((ts - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => PAD.top + (1 - (v - lo) / Math.max(0.001, hi - lo)) * ih;

    return {
      x,
      y,
      lo,
      hi,
      iw,
      ih,
      t0,
      t1,
      last: pts[pts.length - 1].inside_c,
      d: pts
        .map((r, i) => `${i ? "L" : "M"}${x(r.ts).toFixed(1)},${y(r.inside_c).toFixed(1)}`)
        .join(" "),
      bands: usageBands(pts),
      anyBand: pts.some((r) => r.sheet_out === true),
      hours: (t1 - t0) / 3600,
    };
  }, [series, width]);

  if (!geom) {
    return (
      <div className="empty">
        No readings yet. Once the roof unit is reporting, its temperature shows up here.
      </div>
    );
  }

  return (
    <div className="panel" style={{ marginTop: 14 }} ref={box}>
      <h2>Inside, last {fmt(geom.hours, 1)} hours</h2>

      <svg width="100%" height={height} style={{ display: "block", marginTop: 4 }}>
        {geom.bands.map(([a, b]) => (
          <rect
            key={a}
            x={geom.x(a)}
            y={PAD.top}
            width={Math.max(1, geom.x(b) - geom.x(a))}
            height={geom.ih}
            fill="rgba(255,255,255,0.09)"
          />
        ))}

        {[geom.lo, (geom.lo + geom.hi) / 2, geom.hi].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + geom.iw}
              y1={geom.y(v)}
              y2={geom.y(v)}
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={geom.y(v) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--ink-faint)"
            >
              {/* Whole degrees once the span is wide enough to tell them apart.
                  Inside a 2° span every label rounded to the same number, so the
                  axis read 28 / 28 / 28 against a line that was visibly climbing. */}
              {geom.hi - geom.lo >= 5 ? Math.round(v) : v.toFixed(1)}
            </text>
          </g>
        ))}

        <path
          d={geom.d}
          fill="none"
          stroke="var(--gel)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={geom.x(geom.t1)} cy={geom.y(geom.last)} r="3.5" fill="var(--gel)" />
        <text
          x={PAD.left + geom.iw + 7}
          y={geom.y(geom.last) + 4}
          fontSize="12"
          fill="var(--ink)"
        >
          {fmt(geom.last, 1)}°
        </text>

        <text x={PAD.left} y={height - 5} fontSize="11" fill="var(--ink-faint)">
          {clockOf(geom.t0)}
        </text>
        <text
          x={PAD.left + geom.iw}
          y={height - 5}
          textAnchor="end"
          fontSize="11"
          fill="var(--ink-faint)"
        >
          {clockOf(geom.t1)}
        </text>
      </svg>

      <p style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
        <span
          style={{
            width: 20,
            height: 12,
            borderRadius: 3,
            background: "rgba(255,255,255,0.18)",
            flex: "none",
          }}
        />
        {geom.anyBand
          ? "Shaded while the sheet was out over the roof"
          : "The sheet has not been out during this stretch"}
      </p>
    </div>
  );
}
