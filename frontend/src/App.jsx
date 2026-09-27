import { useCallback, useEffect, useState } from "react";
import { api, BOX_KEYS, SERIES_VAR, SHORT_LABEL, clockOf } from "./api.js";
import Hero from "./components/Hero.jsx";
import TempChart from "./components/TempChart.jsx";
import DataTable from "./components/DataTable.jsx";
import WaterGauge from "./components/WaterGauge.jsx";
import CoolingCounter from "./components/CoolingCounter.jsx";
import EventLog from "./components/EventLog.jsx";
import Controls from "./components/Controls.jsx";
import ScaleCalculator from "./components/ScaleCalculator.jsx";

const POLL_MS = 2000;

export default function App() {
  const [state, setState] = useState(null);
  const [series, setSeries] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [viewing, setViewing] = useState(null); // null = live, otherwise a session id
  const [which, setWhich] = useState("inside"); // "inside" | "roof"
  const [hidden, setHidden] = useState([]);
  const [view, setView] = useState("chart"); // "chart" | "table"
  const [theme, setTheme] = useState(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, ser] = await Promise.all([api.state(viewing), api.series(viewing)]);
      setState(s);
      setSeries(ser);
      setOffline(false);
    } catch {
      // A missed poll is not a crash. Keep the last good frame on screen and say so.
      setOffline(true);
    }
  }, [viewing]);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await api.sessions());
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshSessions();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh, refreshSessions]);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  function toggleSeries(k) {
    setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  }

  const onChanged = useCallback(async () => {
    await Promise.all([refresh(), refreshSessions()]);
  }, [refresh, refreshSessions]);

  if (!state) {
    return (
      <div className="wrap">
        <h1>SweatShell</h1>
        <p className="note">Connecting to the rig…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="topbar">
        <h1>SweatShell</h1>
        <span className="sub">
          Eggshell coat + sweating bio gel, measured against bare metal and a wet cloth
        </span>
        <span className="spacer" />
        {offline && (
          <span className="pill" style={{ color: "var(--status-critical)" }}>
            <span className="dot" style={{ background: "var(--status-critical)" }} />
            Backend unreachable — showing last reading
          </span>
        )}
        {viewing && (
          <span className="pill">
            <span className="dot" style={{ background: "var(--series-1)" }} />
            Replaying run #{viewing}
          </span>
        )}
        {state.ready && (
          <span className="pill">
            <span className="dot" style={{ background: "var(--status-good)" }} />
            {state.sample_count} readings · last {clockOf(state.ts)}
          </span>
        )}
        <button
          className="btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>

      {!state.ready ? (
        <div className="card">
          <h2>No data yet</h2>
          <p className="note" style={{ marginBottom: 0 }}>
            {state.message} Run <code>python simulate.py --fast --session "Test run"</code>{" "}
            from the backend folder to fill the dashboard without hardware.
          </p>
        </div>
      ) : (
        <>
          <div className="grid hero-row">
            <Hero deltas={state.deltas} ambient={state.ambient_c} />
            <WaterGauge
              pct={state.water_pct}
              massG={state.gel_mass_g}
              pumpOn={state.pump_on}
              pumpQueued={state.pump_queued}
              humidity={state.humidity}
            />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div
              className="row"
              style={{ justifyContent: "space-between", marginBottom: 10 }}
            >
              <h2 style={{ margin: 0 }}>
                {which === "inside" ? "Inside air temperature" : "Roof surface temperature"}
              </h2>
              <div className="row">
                <button
                  className="btn"
                  onClick={() => setWhich(which === "inside" ? "roof" : "inside")}
                >
                  Show {which === "inside" ? "roof surface" : "inside air"}
                </button>
                <button
                  className="btn"
                  onClick={() => setView(view === "chart" ? "table" : "chart")}
                >
                  {view === "chart" ? "Table view" : "Chart view"}
                </button>
              </div>
            </div>

            {/* Legend is always present for four series, and the chart also carries
                direct labels at the line ends, so identity is never colour-alone. */}
            <div className="legend">
              {BOX_KEYS.map((k) => (
                <button
                  key={k}
                  aria-pressed={!hidden.includes(k)}
                  onClick={() => toggleSeries(k)}
                  title={state.boxes?.[k]}
                >
                  <span className="swatch" style={{ background: SERIES_VAR[k] }} />
                  {SHORT_LABEL[k]}
                </button>
              ))}
            </div>

            {view === "chart" ? (
              <TempChart series={series} which={which} hidden={hidden} />
            ) : (
              <DataTable series={series} which={which} />
            )}
          </div>

          <div className="grid chart-row">
            <CoolingCounter totals={state.totals} assumptions={state.assumptions} />
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              <Controls
                session={state.session}
                sessions={sessions}
                viewing={viewing}
                onView={setViewing}
                config={state.config}
                onChanged={onChanged}
              />
              <EventLog events={state.events} />
            </div>
          </div>

          <ScaleCalculator />
        </>
      )}

      <p className="note" style={{ marginTop: 24 }}>
        Four identical mini houses under one heat lamp. Box 1 bare metal, box 2 eggshell
        coat, box 3 eggshell coat plus the sweating gel, box 4 eggshell coat plus a plain
        wet cloth. Box 4 is there so we can find out whether the gel is worth making at
        all.
      </p>
    </div>
  );
}
