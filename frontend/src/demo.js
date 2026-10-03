/*
 * The app with no rig behind it.
 *
 * WHY THIS EXISTS
 *
 * The roof unit lives on a phone hotspot with a private address. No server on the
 * internet can reach it — not a configuration problem, there is simply no route — so
 * a hosted copy of this app cannot read a real sensor however it is deployed. The
 * live path needs the laptop running and a tunnel open, which is right for a demo
 * someone is standing next to and wrong for a link that has to work at midnight when
 * a judge gets round to it.
 *
 * So this module answers the same calls `api.js` makes, out of a model that runs in
 * the page. Every button works, the numbers move, and the whole thing is static
 * hosting with nothing to keep awake.
 *
 * WHAT IS REAL AND WHAT IS NOT
 *
 * The shapes are real: this file was written against captured responses from the
 * running backend, so the app cannot tell the difference. The numbers are not. They
 * come from the crude model below, and the app carries a badge saying so on every
 * screen, because a demo that cannot be told from a measurement is a lie with a
 * progress bar.
 *
 * The model is deliberately simple — a first-order lag toward a target that depends
 * on whether the sheet is out, and a gel that drains while it works. It is not a
 * thermal simulation and must never be quoted as a result.
 */

const HOUR = 3600;
const now = () => Date.now() / 1000;

/* --------------------------------------------------------------- the model */

// Outside air over a day: coolest before dawn, hottest mid-afternoon. A demo opened
// at any hour should look like that hour rather than like noon.
function outsideAt(ts) {
  // Held, when someone is driving it by hand. Auto triggers on the air outside, and
  // waiting for a real afternoon to cross 26 °C is not a demo anyone will sit
  // through — so the one input the whole automatic behaviour hangs on is the one
  // input a visitor can move.
  if (override !== null) return override;
  const h = new Date(ts * 1000).getHours() + new Date(ts * 1000).getMinutes() / 60;
  // Peak at 15:00, trough at 05:00.
  const phase = Math.cos(((h - 15) / 24) * 2 * Math.PI);
  return 27.5 + 5.5 * phase;
}

let override = null;

/* The outside-air control the demo build puts in the header. */
export const demoWeather = {
  /** Null while the clock is driving; a number while someone is holding it. */
  get: () => override,
  /** What the model is reporting right now, held or not. */
  current: () => Math.round(outsideAt(now()) * 10) / 10,
  set: (c) => {
    override = c === null ? null : Math.max(5, Math.min(50, c));
  },
  /** The thresholds the roof unit is deciding on, so the control can mark them. */
  thresholds: () => ({ hot: S.settings.hot, cool: S.settings.cool }),
};

const S = {
  t: now(),
  inside: 28.5,
  bare: 34.0,
  water: 72,
  sheetOut: true,   // where the roller reports it IS
  target: true,     // where it is heading
  moving: 0,        // seconds of travel left
  pumpUntil: 0,
  litres: 0.4,
  mode: "auto",
  settings: {
    hot: 26.0, cool: 22.0, danger: 30.0, dry_pct: 30,
    humidity: -1, moist_dry_raw: 3500, moist_wet_raw: 1500,
    h1: 0, h2: 1, out: 2,
  },
  autoWater: true,
  waterThreshold: 30,
  schedule: {
    enabled: false,
    windows: [
      {
        id: 1, enabled: true, out_at: "11:00", up_at: "18:00",
        repeat: "daily", days: [0, 1, 2, 3, 4, 5, 6], dates: [1],
        from: null, to: null, label: "Hottest part of the day",
      },
    ],
  },
  nextWindowId: 2,
  protect: { enabled: true, auto: true, wind_gust_kmh: 55.0 },
  servicedAt: now() - 2 * 86400,
  history: [],
};

/** One step of the model. Called on every read, so it works at any poll rate. */
function advance() {
  const t = now();
  const dt = Math.min(120, Math.max(0, t - S.t)); // a backgrounded tab must not leap
  if (dt <= 0) return;
  S.t = t;

  const out = outsideAt(t);

  // The bare side of the roof runs well above the air; the covered side runs below
  // it while the gel still has water to give up.
  const wet = S.water / 100;
  const bareTarget = out + 6.2;
  const coveredTarget = S.target ? out - 1.2 - 2.6 * wet : out + 4.0;

  const lag = (tau) => 1 - Math.exp(-dt / tau);
  S.bare += (bareTarget - S.bare) * lag(900);
  S.inside += (coveredTarget - S.inside) * lag(1200);

  // Travel takes time, and the position does not change until it finishes. The app
  // labels movement from the position it still holds — "rolling out" while it is
  // still up — so a model that flipped instantly made Roll out announce "Rolling
  // up…" and vice versa.
  if (S.moving > 0) {
    S.moving = Math.max(0, S.moving - dt);
    if (S.moving === 0) S.sheetOut = S.target;
  }

  if (t < S.pumpUntil) {
    S.water = Math.min(100, S.water + 4.5 * dt);
  } else if (S.target) {
    // Evaporating is the product working, so the level has to fall while it does.
    const used = Math.min(S.water, 0.004 * dt * 100);
    S.water -= used;
    S.litres += used * 0.012;
  }

  if (S.autoWater && S.water < S.waterThreshold && t >= S.pumpUntil) {
    S.pumpUntil = t + 4;
  }

  // The roof unit's own thresholds, when it is the one deciding.
  if (S.mode === "auto" && S.moving === 0) {
    if (out > S.settings.hot && !S.target) move(true);
    else if (out < S.settings.cool && S.target) move(false);
  }

  if (!S.history.length || t - S.history[S.history.length - 1].ts > 150) {
    S.history.push({ ts: t, inside_c: round(S.inside), sheet_out: S.sheetOut });
    const cutoff = t - 12 * HOUR;
    while (S.history.length && S.history[0].ts < cutoff) S.history.shift();
  }
}

function move(out) {
  if (S.target === out) return;
  S.target = out;
  S.moving = 5;
}

const round = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------ twelve hours of past */

(function seed() {
  const t0 = now() - 12 * HOUR;
  let inside = outsideAt(t0) + 3;
  for (let i = 0; i < 12 * 12; i++) {
    const ts = t0 + i * 300;
    const h = new Date(ts * 1000).getHours();
    // The sheet was out across the afternoon, which is what the chart's shading is
    // there to show.
    const sheetOut = h >= 11 && h < 18;
    const out = outsideAt(ts);
    const target = sheetOut ? out - 2.4 : out + 4.0;
    inside += (target - inside) * (1 - Math.exp(-300 / 1200));
    S.history.push({
      ts,
      inside_c: round(inside + (Math.random() - 0.5) * 0.18),
      sheet_out: sheetOut,
    });
  }
  S.inside = S.history[S.history.length - 1].inside_c;
  S.bare = outsideAt(now()) + 6.0;
  S.sheetOut = S.history[S.history.length - 1].sheet_out;
  S.target = S.sheetOut;
})();

/* ------------------------------------------------- schedule, ported from main.py */

const hhmm = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

function appliesToday(w, d) {
  if (!w.enabled) return false;
  if (w.repeat === "daily") return true;
  if (w.repeat === "weekly") return (w.days ?? []).includes((d.getDay() + 6) % 7);
  if (w.repeat === "monthly") return (w.dates ?? []).includes(d.getDate());
  return false;
}

/** The window covering this moment, if any. Windows may cross midnight. */
function activeWindow(d) {
  const mins = d.getHours() * 60 + d.getMinutes();
  for (const w of S.schedule.windows) {
    if (!appliesToday(w, d)) continue;
    const a = hhmm(w.out_at);
    const b = hhmm(w.up_at);
    if (a <= b ? mins >= a && mins < b : mins >= a || mins < b) return w;
  }
  return null;
}

function wantsOut(d) {
  if (!S.schedule.enabled) return null;
  const today = S.schedule.windows.filter((w) => appliesToday(w, d));
  if (!today.length) return null;
  return activeWindow(d) !== null;
}

/** The next boundary the schedule will cross, searched day by day. */
function nextChange(d) {
  if (!S.schedule.enabled) return null;
  const current = wantsOut(d);
  for (let day = 0; day < 70; day++) {
    const probe = new Date(d);
    probe.setDate(probe.getDate() + day);
    const marks = [];
    for (const w of S.schedule.windows) {
      if (!appliesToday(w, probe)) continue;
      marks.push([hhmm(w.out_at), "out", w.out_at], [hhmm(w.up_at), "up", w.up_at]);
    }
    marks.sort((x, y) => x[0] - y[0]);
    const after = day === 0 ? d.getHours() * 60 + d.getMinutes() : -1;
    for (const [m, to, at] of marks) {
      if (m <= after) continue;
      const when = new Date(probe);
      when.setHours(Math.floor(m / 60), m % 60, 0, 0);
      // A boundary where one window ends exactly as the next begins is not a move.
      const wouldBe = to === "out";
      if (day === 0 && current === wouldBe) continue;
      return {
        at,
        date: when.toISOString().slice(0, 10),
        epoch: when.getTime() / 1000,
        to,
        today: day === 0,
        days_away: day,
      };
    }
  }
  return null;
}

/* --------------------------------------------------------------- the responses */

function homePayload() {
  advance();
  const d = new Date();
  const want = wantsOut(d);
  const active = activeWindow(d);

  // The clock stands down while the roof unit is deciding — the same rule the
  // backend follows, for the same reason.
  if (S.mode === "manual" && S.schedule.enabled && want !== null && S.moving === 0) {
    if (want !== S.target && S.lastWant !== undefined && S.lastWant !== want) move(want);
    S.lastWant = want;
  } else if (want !== null) {
    S.lastWant = want;
  }

  const pumping = now() < S.pumpUntil;
  const serviceDays = 90 - (now() - S.servicedAt) / 86400;

  return {
    ready: true,
    ts: S.t,
    stale: false,
    inside_c: round(S.inside),
    inside_humidity: null,
    outside_c: round(outsideAt(S.t)),
    water_pct: Math.round(S.water),
    litres_used: Math.round(S.litres * 10) / 10,
    sheet_out: S.sheetOut,
    sheet_moving: S.moving > 0,
    pump_on: pumping,
    pump_queued: false,
    auto_water: S.autoWater,
    water_threshold_pct: S.waterThreshold,
    status: "good",
    advice: "Cooling normally. Nothing to do.",
    device: {
      mode: S.mode,
      settings: { ...S.settings },
      temps: {
        house1: round(S.bare),
        house2: round(S.inside),
        outside: round(outsideAt(S.t)),
      },
      connected: true,
      settings_error: null,
      error: null,
      url: "demo",
      seconds_since_ok: 0.4,
    },
    schedule: {
      enabled: S.schedule.enabled,
      windows: S.schedule.windows.map((w) => ({ ...w })),
      active_window_id: active ? active.id : null,
      wants_out: want,
      next_change: nextChange(d),
    },
    protect: {
      ...S.protect,
      warning: null,
      forecast_source: "sample",
      season_over: false,
    },
    maintenance: {
      days_in_service: Math.floor((now() - S.servicedAt) / 86400),
      days_until_service: Math.max(0, Math.round(serviceDays)),
      interval_days: 90,
      progress: Math.min(1, Math.max(0, 1 - serviceDays / 90)),
      overdue: serviceDays <= 0,
      task: "Spray the setting solution once to firm the gel up again.",
      good_day: null,
    },
  };
}

const ok = (v) => Promise.resolve(v);

export const demoApi = {
  home: () => ok(homePayload()),
  series: () => {
    advance();
    return ok(S.history.map((r) => ({ ...r })));
  },
  water: () => {
    S.pumpUntil = now() + 4;
    return ok({ ok: true });
  },
  setAutoWater: (on) => {
    S.autoWater = on;
    return ok({ ok: true });
  },
  moveSheet: (out) => {
    // Touching a button takes control back, exactly as the firmware does.
    S.mode = "manual";
    move(out);
    return ok({ ok: true });
  },
  setMode: (auto) => {
    S.mode = auto ? "auto" : "manual";
    return ok({ ok: true });
  },
  setDeviceSettings: (patch) => {
    if (patch.dry != null) {
      S.settings.dry_pct = patch.dry;
      S.waterThreshold = patch.dry;
    }
    for (const k of ["hot", "cool", "danger", "h1", "h2", "out"])
      if (patch[k] != null) S.settings[k] = patch[k];
    return ok({ ok: true });
  },
  setWaterThreshold: (pct) => {
    S.waterThreshold = pct;
    S.settings.dry_pct = pct;
    return ok({ ok: true });
  },
  setSchedule: (patch) => {
    Object.assign(S.schedule, patch);
    S.lastWant = undefined;
    return ok({ ok: true });
  },
  addWindow: () => {
    S.schedule.windows.push({
      id: S.nextWindowId++,
      enabled: true,
      out_at: "09:00",
      up_at: "17:00",
      repeat: "daily",
      days: [0, 1, 2, 3, 4, 5, 6],
      dates: [new Date().getDate()],
      from: null,
      to: null,
      label: "",
    });
    S.lastWant = undefined;
    return ok({ ok: true });
  },
  setWindow: (id, patch) => {
    const w = S.schedule.windows.find((x) => x.id === id);
    if (w) Object.assign(w, patch);
    S.lastWant = undefined;
    return ok({ ok: true });
  },
  deleteWindow: (id) => {
    S.schedule.windows = S.schedule.windows.filter((x) => x.id !== id);
    S.lastWant = undefined;
    return ok({ ok: true });
  },
  setProtect: (patch) => {
    Object.assign(S.protect, patch);
    return ok({ ok: true });
  },
  serviced: () => {
    S.servicedAt = now();
    return ok({ ok: true });
  },
  setBridge: () => ok({ ok: true }),
};
