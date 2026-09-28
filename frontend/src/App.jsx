import { useCallback, useEffect, useState } from "react";
import { api, clockOf } from "./api.js";
import Alerts from "./components/Alerts.jsx";
import { IndoorTile, AdviceBar } from "./components/IndoorCard.jsx";
import WaterCard from "./components/WaterCard.jsx";
import SheetCard from "./components/SheetCard.jsx";
import AutomaticCard from "./components/AutomaticCard.jsx";
import InsideChart from "./components/InsideChart.jsx";
import MaintenanceCard from "./components/MaintenanceCard.jsx";
import CareCard from "./components/CareCard.jsx";

/*
 * One screen, built for a phone, in the order things matter.
 *
 * Anything dated goes first, because an alert three cards down is a log entry. Then
 * the two numbers people open the app for, side by side so the first screenful
 * answers "how warm is it and does it need water" without a scroll. Then the sheet
 * and the one button that moves it. Settings are folded away — they are set once and
 * forgotten, so they do not belong between a person and their daily glance.
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

      <Alerts home={home.ready ? home : null} offline={offline} />

      {!home.ready ? (
        <div className="card">
          <h2>Not connected</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>{home.message}</p>
        </div>
      ) : (
        <>
          <IndoorTile home={home} />
          <WaterCard home={home} busy={busy} onWater={() => act(() => api.water())} />
          <AdviceBar home={home} />
          <SheetCard
            home={home}
            busy={busy}
            onMove={(out) => act(() => api.moveSheet(out))}
          />
          <InsideChart series={series} />
          <AutomaticCard
            home={home}
            busy={busy}
            onAuto={(on) => act(() => api.setAutoWater(on))}
            onSchedule={(patch) => act(() => api.setSchedule(patch))}
            onProtect={(patch) => act(() => api.setProtect(patch))}
          />
          <MaintenanceCard
            m={home.maintenance}
            busy={busy}
            onDone={() => act(() => api.serviced())}
          />
          <CareCard />
          <p className="foot">Updated {clockOf(home.ts)}</p>
        </>
      )}
    </div>
  );
}
