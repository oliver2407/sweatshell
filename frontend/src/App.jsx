import { useCallback, useEffect, useState } from "react";
import { api, clockOf, explain } from "./api.js";
import ControlTab from "./components/ControlTab.jsx";
import HistoryTab from "./components/HistoryTab.jsx";
import AutoTab from "./components/AutoTab.jsx";
import CareTab from "./components/CareTab.jsx";
import { Drop, Chart, Clock, Leaf } from "./components/icons.jsx";
import useIsWide from "./useIsWide.js";

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
  const [dismissed, setDismissed] = useState([]);
  const [failed, setFailed] = useState(null);
  const wide = useIsWide();

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
    setFailed(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      // This used to log to the console and stop. Pressing a button and having
      // nothing at all happen is the worst failure a screen can have: there is
      // nothing to react to and nothing to search for.
      console.error(e);
      // Stamped, so dismissing one failure does not hide the next identical one.
      setFailed({ msg: explain(e), at: Date.now() });
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

  const warn = home.ready ? home.protect?.warning : null;

  const alerts = [
    // A failed action goes first. It is the only one the person caused, so it is
    // the only one they are waiting on.
    failed && {
      key: `failed:${failed.at}`,
      tone: "var(--crit)",
      head: "Didn’t work.",
      body: failed.msg,
    },
    offline && {
      key: "offline",
      tone: "var(--crit)",
      head: "Can’t reach your roof.",
      body: "Showing the last reading that came through.",
    },
    warn && {
      key: `warn:${warn.start}:${warn.reason}`,
      tone: "var(--warn)",
      head: `${windowLabel(warn)} — ${warn.reason}.`,
      body: warnAdvice(warn, home.protect.auto, home.sheet_out),
    },
    home.ready &&
      home.protect?.season_over && {
        key: "season",
        tone: "var(--ink-faint)",
        head: "The next week is mild.",
        body: "If the hot season is over, roll it up, dry it fully, and store it.",
      },
  ].filter(Boolean).filter((a) => !dismissed.includes(a.key));

  return (
    <div className="shell">
      <header className="bar">
        <span className="where">Your roof</span>
        <span className="when">
          {offline ? "Offline" : home.ready ? clockOf(home.ts) : ""}
        </span>
      </header>

      {/*
        Alerts float over the content in one fixed spot rather than sitting in the
        flow above it. In the flow, a storm warning arriving mid-glance shoved the
        dial down the screen and whatever the person was reaching for moved out from
        under their thumb. Pinned here, the layout underneath never changes.

        Each is dismissable, and the key includes what it says — so a dismissed
        warning stays gone, and a *different* warning still gets through.
      */}
      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((a) => (
            <div className="alert" key={a.key}>
              <span className="pip" style={{ background: a.tone }} />
              <span>
                <strong>{a.head}</strong> {a.body}
              </span>
              <button
                className="alert-x"
                aria-label="Dismiss"
                onClick={() => setDismissed((d) => [...d, a.key])}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="body">
        {!home.ready ? (
          <div className="empty">
            {home.message} Once the roof unit is powered and on your wifi, its readings
            arrive here.
          </div>
        ) : tab === "control" ? (
          <ControlTab
            home={home}
            busy={busy}
            wide={wide}
            // On a wide screen the chart rides along beside the controls, so the
            // trend and the current reading are on screen together.
            aside={
              <>
                <HistoryTab series={series} />
                <CareTab
                  m={home.maintenance}
                  busy={busy}
                  onDone={() => act(() => api.serviced())}
                  compact
                />
              </>
            }
            onMove={(out) => act(() => api.moveSheet(out))}
            onSchedule={(patch) => act(() => api.setSchedule(patch))}
            onWater={() => act(() => api.water())}
          />
        ) : tab === "history" ? (
          <HistoryTab series={series} />
        ) : tab === "auto" ? (
          // Settings and reading matter are capped to a column. Stretching a time
          // input across 1400px does not make it easier to set, only longer to
          // cross, and a row of seven day chips a hand-span wide is a phone layout
          // pulled out of shape.
          <div className="column">
            <AutoTab
              home={home}
              busy={busy}
              onSchedule={(patch) => act(() => api.setSchedule(patch))}
              onProtect={(patch) => act(() => api.setProtect(patch))}
              onAutoWater={(on) => act(() => api.setAutoWater(on))}
              onWindowPatch={(id, patch) => act(() => api.setWindow(id, patch))}
              onWindowAdd={() => act(() => api.addWindow())}
              onWindowDelete={(id) => act(() => api.deleteWindow(id))}
            />
          </div>
        ) : (
          <div className="column">
            <CareTab
              m={home.maintenance}
              busy={busy}
              onDone={() => act(() => api.serviced())}
            />
          </div>
        )}
      </div>

      <nav className="tabs" role="tablist">
        <span className="brand">SweatShell</span>
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
