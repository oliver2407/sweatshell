import { useEffect, useMemo, useRef, useState } from "react";
import { BOX_KEYS, SERIES_VAR, SHORT_LABEL, clockOf, fmt } from "../api.js";

/*
 * Four-series line chart, hand-drawn in SVG.
 *
 * Deliberately not a chart library. The things that matter here — 2px strokes, a
 * hairline grid, one y-axis, a crosshair tooltip, and direct labels at the line
 * ends — are all easier to get exactly right in raw SVG than to argue out of a
 * library's defaults.
 *
 * One y-axis, always. Temperature is the only measure on this chart. Humidity and
 * gel mass live in their own panels rather than on a second scale.
 */

// The right gutter holds the direct labels (swatch + name + value). It has to be
// wide enough for the longest name plus a right-aligned number, or the values get
// clipped at the edge of the SVG.
const PAD = { top: 14, right: 152, bottom: 30, left: 44 };
const LABEL_MIN_GAP = 14; // px between stacked end labels

function useWidth(ref, fallback = 720) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Push overlapping end labels apart so none of them sit on top of another. */
function declutter(items, minGap) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y;
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap;
  }
  return sorted;
}

export default function TempChart({ series, which, hidden, height = 300 }) {
  const box = useRef(null);
  const width = useWidth(box);
  const [hover, setHover] = useState(null);

  const visible = BOX_KEYS.filter((k) => !hidden.includes(k));

  const geom = useMemo(() => {
    const pts = series.filter((r) => r[which]);
    if (pts.length < 2) return null;

    const t0 = pts[0].ts;
    const t1 = pts[pts.length - 1].ts;
    const vals = [];
    for (const r of pts) for (const k of visible) {
      const v = r[which][k];
      if (typeof v === "number") vals.push(v);
    }
    if (!vals.length) return null;

    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = Math.max(1, (hi - lo) * 0.12);
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);

    const iw = Math.max(80, width - PAD.left - PAD.right);
    const ih = height - PAD.top - PAD.bottom;
    const x = (ts) => PAD.left + ((ts - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => PAD.top + (1 - (v - lo) / Math.max(0.001, hi - lo)) * ih;

    const lines = visible.map((k) => {
      const d = pts
        .map((r) => [r.ts, r[which][k]])
        .filter(([, v]) => typeof v === "number")
        .map(([ts, v], i) => `${i ? "L" : "M"}${x(ts).toFixed(1)},${y(v).toFixed(1)}`)
        .join(" ");
      const last = [...pts].reverse().find((r) => typeof r[which][k] === "number");
      return { key: k, d, last: last ? last[which][k] : null };
    });

    const ticks = [];
    const stepCount = 4;
    for (let i = 0; i <= stepCount; i++) {
      const v = lo + ((hi - lo) * i) / stepCount;
      ticks.push({ v, y: y(v) });
    }

    // End labels: the relief for the two light-mode slots that sit under 3:1
    // contrast. They are not optional decoration.
    const labels = declutter(
      lines
        .filter((l) => l.last !== null)
        .map((l) => ({ key: l.key, y: y(l.last), v: l.last })),
      LABEL_MIN_GAP,
    );

    return { pts, x, y, lo, hi, iw, ih, lines, ticks, labels, t0, t1 };
  }, [series, which, visible.join(","), width, height]);

  function onMove(e) {
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = null;
    for (const r of geom.pts) {
      const d = Math.abs(geom.x(r.ts) - px);
      if (!best || d < best.d) best = { d, r };
    }
    if (best && best.d < 60) setHover(best.r);
    else setHover(null);
  }

  if (!geom) {
    return (
      <div ref={box} style={{ height, display: "grid", placeItems: "center" }}>
        <span className="note">Waiting for at least two readings…</span>
      </div>
    );
  }

  const hx = hover ? geom.x(hover.ts) : null;

  return (
    <div ref={box} style={{ position: "relative" }}>
      <svg
        width="100%"
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", touchAction: "none" }}
      >
        {/* Recessive grid: hairlines, no fills, no frame. */}
        {geom.ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={PAD.left + geom.iw}
              y1={t.y}
              y2={t.y}
              stroke="var(--gridline)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={t.y + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-muted)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(t.v)}
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={PAD.left + geom.iw}
          y1={PAD.top + geom.ih}
          y2={PAD.top + geom.ih}
          stroke="var(--baseline)"
          strokeWidth="1"
        />
        <text x={PAD.left} y={height - 8} fontSize="11" fill="var(--text-muted)">
          {clockOf(geom.t0)}
        </text>
        <text
          x={PAD.left + geom.iw / 2}
          y={height - 8}
          fontSize="11"
          fill="var(--text-muted)"
          textAnchor="middle"
        >
          {fmt((geom.t1 - geom.t0) / 60, 0)} minutes of run
        </text>
        <text
          x={PAD.left + geom.iw}
          y={height - 8}
          fontSize="11"
          fill="var(--text-muted)"
          textAnchor="end"
        >
          {clockOf(geom.t1)}
        </text>

        {hx !== null && (
          <line
            x1={hx}
            x2={hx}
            y1={PAD.top}
            y2={PAD.top + geom.ih}
            stroke="var(--baseline)"
            strokeWidth="1"
          />
        )}

        {geom.lines.map((l) => (
          <path
            key={l.key}
            d={l.d}
            fill="none"
            stroke={SERIES_VAR[l.key]}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hover markers get a 2px surface ring so overlapping dots stay readable. */}
        {hover &&
          visible.map((k) =>
            typeof hover[which][k] === "number" ? (
              <circle
                key={k}
                cx={geom.x(hover.ts)}
                cy={geom.y(hover[which][k])}
                r="4.5"
                fill={SERIES_VAR[k]}
                stroke="var(--surface-1)"
                strokeWidth="2"
              />
            ) : null,
          )}

        {/* Direct labels at the line ends. Text stays in ink tokens; the small
            swatch beside it carries the series identity. */}
        {geom.labels.map((l) => (
          <g key={l.key}>
            <rect
              x={PAD.left + geom.iw + 8}
              y={l.y - 5}
              width="8"
              height="8"
              rx="2"
              fill={SERIES_VAR[l.key]}
            />
            <text
              x={PAD.left + geom.iw + 21}
              y={l.y + 4}
              fontSize="11.5"
              fill="var(--text-secondary)"
            >
              {SHORT_LABEL[l.key]}
            </text>
            {/* Value is right-aligned to the gutter edge rather than offset from
                the name, so a long series name can never push it out of view. */}
            <text
              x={PAD.left + geom.iw + PAD.right - 4}
              y={l.y + 4}
              textAnchor="end"
              fontSize="11.5"
              fill="var(--text-primary)"
              fontWeight="600"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmt(l.v, 1)}°
            </text>
          </g>
        ))}
      </svg>

      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hx - 70, 4), width - 160),
            top: 4,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
            pointerEvents: "none",
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            minWidth: 150,
          }}
        >
          <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
            {new Date(hover.ts * 1000).toLocaleTimeString()}
          </div>
          {visible.map((k) => (
            <div
              key={k}
              style={{ display: "flex", alignItems: "center", gap: 6, lineHeight: 1.6 }}
            >
              <span className="swatch" style={{ background: SERIES_VAR[k] }} />
              <span style={{ color: "var(--text-secondary)", flex: 1 }}>
                {SHORT_LABEL[k]}
              </span>
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(hover[which][k], 1)}°
              </strong>
            </div>
          ))}
          {hover.humidity != null && (
            <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
              RH {fmt(hover.humidity, 0)}% · gel {fmt(hover.water_pct, 0)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}
