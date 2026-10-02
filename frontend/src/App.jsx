import { useCallback, useEffect, useState } from "react";
import { api, clockOf } from "./api.js";
import ControlTab from "./components/ControlTab.jsx";
import HistoryTab from "./components/HistoryTab.jsx";
import AutoTab from "./components/AutoTab.jsx";
import CareTab from "./components/CareTab.jsx";
import { Drop, Chart, Clock, Leaf } from "./components/icons.jsx";

/*
 * A control panel, not a page.
 *
 * Four tabs, a fixed bar, and nothing scrolls on the one people open most. The
 * alert sits above the tab content rather than inside a tab, because weather that
 * could tear the sheet is not a thing to go looking for.
 */

const POLL_MS = 3000;

const TABS = [
  { id: "control", label: "Control", Icon: Drop },
  { id: "history", label: "History", Icon: Chart },
  { id: "auto", label: "Automatic", Icon: Clock },
  { id: "care", label: "Care", Icon: Leaf },
];

function formatDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

function hourOf(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function windowLabel(w) {
  const now = Date.now() / 1000;
  if (now >= w.end) return "Clearing";
  if (now >= w.start) return `Now until ${hourOf(w.end)}`;
  return `${formatDay(w.date)}, ${hourOf(w.start)}–${hourOf(w.end)}`;
}

function warnAdvice(w, auto, sheetOut) {
  if (!sheetOut) return `Keep it rolled up until ${hourOf(w.safe_after)}.`;
  if (auto) return `The sheet will roll itself up around ${hourOf(w.roll_up_by)}.`;
  return `Roll it up by ${hourOf(w.roll_up_by)} so it doesn’t tear.`;
}

export default function App() {
  const [home, setHome] = useState(null);
  const [series, setSeries] = useState([]);
  const [tab, setTab] = useState("control");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);

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
      <div className="shell">
        <div className="bar">
          <span className="where">SweatShell</span>
        </div>
        <div className="body">
          <div className="empty">Looking for your roof…</div>
        </div>
      </div>
    );
  }

  const warn = home.protect?.warning;

  return (
    <div className="shell">
      <header className="bar">
        <span className="where">Your roof</span>
        <span className="when">
          {offline ? "Offline" : home.ready ? clockOf(home.ts) : ""}
        </span>
      </header>

      <div className="body">
        {offline && (
          <div className="alert">
            <span className="pip" style={{ background: "var(--crit)" }} />
            <span>
              <strong>Can’t reach your roof.</strong> Showing the last reading that
              came through.
            </span>
          </div>
        )}

        {home.ready && warn && (
          <div className="alert">
            <span className="pip" style={{ background: "var(--warn)" }} />
            <span>
              <strong>
                {windowLabel(warn)} — {warn.reason}.
              </strong>{" "}
              {warnAdvice(warn, home.protect.auto, home.sheet_out)}
            </span>
          </div>
        )}

        {home.ready && home.protect?.season_over && (
          <div className="alert">
            <span className="pip" style={{ background: "var(--ink-faint)" }} />
            <span>
              <strong>The next week is mild.</strong> If the hot season is over, roll
              it up, dry it fully, and store it.
            </span>
          </div>
        )}

        {!home.ready ? (
          <div className="empty">
            {home.message} Once the roof unit is powered and on your wifi, its readings
            arrive here.
          </div>
        ) : tab === "control" ? (
          <ControlTab
            home={home}
            busy={busy}
            onMove={(out) => act(() => api.moveSheet(out))}
            onSchedule={(patch) => act(() => api.setSchedule(patch))}
            onWater={() => act(() => api.water())}
          />
        ) : tab === "history" ? (
          <HistoryTab series={series} />
        ) : tab === "auto" ? (
          <AutoTab
            home={home}
            busy={busy}
            onSchedule={(patch) => act(() => api.setSchedule(patch))}
            onProtect={(patch) => act(() => api.setProtect(patch))}
            onAutoWater={(on) => act(() => api.setAutoWater(on))}
          />
        ) : (
          <CareTab
            m={home.maintenance}
            busy={busy}
            onDone={() => act(() => api.serviced())}
          />
        )}
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="tab"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
