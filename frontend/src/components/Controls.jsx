import { useState } from "react";
import { api } from "../api.js";

/*
 * Run controls.
 *
 * The manual water button exists because a demo cannot depend on the gel happening
 * to dry out while a judge is watching. The session picker is replay mode: pick a
 * finished run and the whole dashboard reads that instead of live data, so a bad
 * probe five minutes before judging is an inconvenience rather than the end.
 */

export default function Controls({
  session,
  sessions,
  viewing,
  onView,
  config,
  onChanged,
}) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Run</h2>

      {session ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="pill">
              <span className="dot" style={{ background: "var(--status-good)" }} />
              Recording: {session.label}
            </span>
          </div>
          <div className="row">
            <button
              className="btn"
              disabled={busy}
              onClick={() => act(() => api.stopSession(session.id))}
            >
              Stop run
            </button>
            <a className="btn" href={api.exportUrl(session.id)}>
              Download CSV
            </a>
          </div>
        </>
      ) : (
        <div className="row">
          <input
            type="text"
            placeholder="e.g. Gel 3mm vs wet cloth"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button
            className="btn primary"
            disabled={busy || !label.trim()}
            onClick={() => act(() => api.startSession(label.trim()))}
          >
            Start run
          </button>
        </div>
      )}

      <h2 style={{ marginTop: 18 }}>Watering</h2>
      <div className="row">
        <button
          className="btn"
          disabled={busy}
          onClick={() => act(() => api.pump(config?.pump_run_seconds ?? 5))}
        >
          Water the gel now
        </button>
        <button
          className="btn"
          disabled={busy}
          onClick={() => act(() => api.patchConfig({ auto_pump: !config?.auto_pump }))}
        >
          Auto-water: {config?.auto_pump ? "on" : "off"}
        </button>
      </div>
      <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
        Auto-waters below {config?.pump_threshold_pct ?? "—"}% for{" "}
        {config?.pump_run_seconds ?? "—"} s.
      </p>

      <h2 style={{ marginTop: 18 }}>Replay a past run</h2>
      <div className="row">
        <select
          className="btn"
          value={viewing ?? ""}
          onChange={(e) => onView(e.target.value ? Number(e.target.value) : null)}
          style={{ flex: 1, minWidth: 180 }}
        >
          <option value="">Live</option>
          {sessions?.map((s) => (
            <option key={s.id} value={s.id}>
              #{s.id} {s.label} ({s.reading_count} readings)
            </option>
          ))}
        </select>
        {viewing && (
          <a className="btn" href={api.exportUrl(viewing)}>
            CSV
          </a>
        )}
      </div>
    </div>
  );
}
