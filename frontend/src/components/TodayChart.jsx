import { useEffect, useMemo, useRef, useState } from "react";
import { clockOf, fmt } from "../api.js";

/*
 * Two lines: the room with SweatShell, and the same room without it.
 *
 * The bench chart has four series and a control box. This one has two, because the
 * question a resident is asking is "is it making a difference today", and a fifth
 * line is a question rather than an answer.
 *
 * Labels sit at the end of each line, so nobody has to match a colour to a legend
 * on a phone screen. One y-axis, hairline grid, 2px strokes.
 */

const PAD = { top: 12, right: 74, bottom: 22, left: 32 };
const SERIES = [
  { key: "with_sweatshell", name: "With", color: "var(--series-1)" },
  { key: "without", name: "Without", color: "var(--series-2)" },
];

function useWidth(ref, fallback = 380) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export default function TodayChart({ series, height = 168 }) {
  const box = useRef(null);
  const width = useWidth(box);

  const geom = useMemo(() => {
    const pts = series.filter(
      (r) => typeof r.with_sweatshell === "number" && typeof r.without === "number",
    );
    if (pts.length < 2) return null;

    const t0 = pts[0].ts;
    const t1 = pts[pts.length - 1].ts;
    const vals = pts.flatMap((r) => [r.with_sweatshell, r.without]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = Math.max(1, (hi - lo) * 0.15);
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);

    const iw = Math.max(60, width - PAD.left - PAD.right);
    const ih = height - PAD.top - PAD.bottom;
    const x = (ts) => PAD.left + ((ts - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => PAD.top + (1 - (v - lo) / Math.max(0.001, hi - lo)) * ih;

    const lines = SERIES.map((s) => ({
      ...s,
      d: pts
        .map((r, i) => `${i ? "L" : "M"}${x(r.ts).toFixed(1)},${y(r[s.key]).toFixed(1)}`)
        .join(" "),
      lastY: y(pts[pts.length - 1][s.key]),
      lastV: pts[pts.length - 1][s.key],
    }));

    // Keep the two end labels from landing on top of one another.
    if (Math.abs(lines[0].lastY - lines[1].lastY) < 15) {
      if (lines[0].lastY < lines[1].lastY) lines[1].lastY = lines[0].lastY + 15;
      else lines[0].lastY = lines[1].lastY + 15;
    }

    return { x, y, lo, hi, iw, ih, lines, t0, t1 };
  }, [series, width, height]);

  if (!geom) {
    return (
      <div className="card">
        <h2>Today</h2>
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
      <h2>Today</h2>
      <div ref={box}>
        <svg width="100%" height={height} style={{ display: "block" }}>
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

          {geom.lines.map((l) => (
            <path
              key={l.key}
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {geom.lines.map((l) => (
            <g key={l.key}>
              <rect
                x={PAD.left + geom.iw + 6}
                y={l.lastY - 5}
                width="8"
                height="8"
                rx="2"
                fill={l.color}
              />
              <text
                x={PAD.left + geom.iw + 18}
                y={l.lastY + 4}
                fontSize="11.5"
                fill="var(--text-secondary)"
              >
                {l.name}
              </text>
              <text
                x={PAD.left + geom.iw + 18}
                y={l.lastY + 17}
                fontSize="12"
                fontWeight="600"
                fill="var(--text-primary)"
              >
                {fmt(l.lastV, 0)}°
              </text>
            </g>
          ))}

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
    </div>
  );
}
