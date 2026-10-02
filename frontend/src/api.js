/*
 * API client for the phone app.
 *
 * Only two endpoints. /api/home returns what a person living with the product needs
 * to decide something; the bench endpoints exist on the backend but nothing here
 * asks for them, because every extra number on this screen is one the user has to
 * make sense of on their own.
 *
 * Polling, not sockets. A dropped poll is two seconds of staleness; a dropped socket
 * on patchy mobile data is a dead screen.
 */

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    // The status travels with the error so the app can say something useful. A 404
    // on an endpoint the app knows about means the backend is older than the page
    // being served, which is the single most common way this breaks: pull the
    // repo, reload the browser, forget to restart uvicorn.
    const err = new Error(`${options.method ?? "GET"} ${path} -> ${res.status}`);
    err.status = res.status;
    err.path = path;
    throw err;
  }
  return res.json();
}

/**
 * Why an action failed, in words. Never a status code on its own.
 *
 * The 404 case is worth naming precisely: it means the backend is older than the
 * page being served, which is the single most common way this breaks — pull the
 * repo, reload the browser, forget to restart uvicorn.
 */
export function explain(err) {
  if (err?.status === 404)
    return "The backend is running an older version than this page. Restart uvicorn and try again.";
  if (err?.status === 422) return "The backend wouldn’t accept that value.";
  if (err?.status >= 500) return "The backend hit an error — check its terminal.";
  return "The backend didn’t answer.";
}

export const api = {
  home: () => req("/api/home"),
  series: () => req("/api/home/series"),
  water: () => req("/api/pump", { method: "POST" }),
  setAutoWater: (on) =>
    req("/api/config", { method: "PATCH", body: JSON.stringify({ auto_pump: on }) }),
  moveSheet: (out) => req(`/api/sheet?out=${out}`, { method: "POST" }),
  setMode: (auto) => req(`/api/mode?auto=${auto}`, { method: "POST" }),
  setDeviceSettings: (patch) =>
    req("/api/device/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  setSchedule: (patch) =>
    req("/api/schedule", { method: "PATCH", body: JSON.stringify(patch) }),
  addWindow: () => req("/api/schedule/windows", { method: "POST" }),
  setWindow: (id, patch) =>
    req(`/api/schedule/windows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  deleteWindow: (id) =>
    req(`/api/schedule/windows/${id}`, { method: "DELETE" }),
  setProtect: (patch) =>
    req("/api/protect", { method: "PATCH", body: JSON.stringify(patch) }),
  serviced: () => req("/api/maintenance/done", { method: "POST" }),
};

export function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

export function clockOf(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
