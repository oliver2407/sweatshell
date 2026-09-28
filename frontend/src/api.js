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
  if (!res.ok) throw new Error(`${options.method ?? "GET"} ${path} -> ${res.status}`);
  return res.json();
}

export const api = {
  home: () => req("/api/home"),
  series: () => req("/api/home/series"),
  water: () => req("/api/pump", { method: "POST" }),
  setAutoWater: (on) =>
    req("/api/config", { method: "PATCH", body: JSON.stringify({ auto_pump: on }) }),
  moveSheet: (out) => req(`/api/sheet?out=${out}`, { method: "POST" }),
  setSchedule: (patch) =>
    req("/api/schedule", { method: "PATCH", body: JSON.stringify(patch) }),
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
