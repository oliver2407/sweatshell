import { useCallback, useEffect, useState } from "react";
import { api, clockOf } from "./api.js";
import StatusCard from "./components/StatusCard.jsx";
import WaterCard from "./components/WaterCard.jsx";
import SheetCard from "./components/SheetCard.jsx";
import TodayChart from "./components/TodayChart.jsx";
import CareCard from "./components/CareCard.jsx";

/*
 * One screen, built for a phone.
 *
 * The order is the order someone actually wants it: is it working, does it need
 * water, where is the sheet, how has today gone, how do I look after it. Nothing on
 * this screen asks the reader to interpret anything — the bench numbers, the energy
 * chain and the experiment controls stay on the backend, where the team can still
 * get at them.
 */

const POLL_MS = 3000;

export default function App() {
  const [home, setHome] = useState(null);
  const [series, setSeries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [theme, setTheme] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [h, s] = await Promise.all([api.home(), api.series()]);
      setHome(h);
      setSeries(s);
      setOffline(false);
    } catch {
      // Keep the last good screen rather than blanking it. On mobile data a missed
      // poll is normal and the next one is three seconds away.
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  if (!home) {
    return (
      <div className="app">
        <h1>SweatShell</h1>
        <p style={{ color: "var(--text-muted)" }}>Connecting to your roof…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="head">
        <h1>SweatShell</h1>
        <button
          className="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </header>

      {offline && (
        <div className="warnbar">
          <span className="dot" style={{ background: "var(--status-critical)", marginTop: 0 }} />
          Can’t reach your roof. Showing the last reading.
        </div>
      )}

      {!home.ready ? (
        <div className="card">
          <h2>Not connected</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>{home.message}</p>
        </div>
      ) : (
        <>
          <StatusCard home={home} />
          <WaterCard
            home={home}
            busy={busy}
            onWater={() => act(() => api.water())}
            onAuto={(on) => act(() => api.setAutoWater(on))}
          />
          <SheetCard
            home={home}
            busy={busy}
            onMove={(out) => act(() => api.moveSheet(out))}
          />
          <TodayChart series={series} />
          <CareCard />
          <p className="foot">Updated {clockOf(home.ts)}</p>
        </>
      )}
    </div>
  );
}
