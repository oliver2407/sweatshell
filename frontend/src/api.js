/*
 * API client.
 *
 * Polling, not WebSockets. On venue wifi a dropped socket is a dead dashboard;
 * a dropped poll just means the next one is 2 seconds away.
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
  state: (sessionId) =>
    req(`/api/state${sessionId ? `?session_id=${sessionId}` : ""}`),
  series: (sessionId) =>
    req(`/api/series${sessionId ? `?session_id=${sessionId}` : ""}`),
  sessions: () => req("/api/sessions"),
  startSession: (label) =>
    req("/api/session/start", { method: "POST", body: JSON.stringify({ label }) }),
  stopSession: (id) => req(`/api/session/${id}/stop`, { method: "POST" }),
  pump: (seconds) =>
    req(`/api/pump${seconds ? `?seconds=${seconds}` : ""}`, { method: "POST" }),
  patchConfig: (patch) =>
    req("/api/config", { method: "PATCH", body: JSON.stringify(patch) }),
  scale: (q) => req("/api/scale", { method: "POST", body: JSON.stringify(q) }),
  exportUrl: (id) => `${BASE}/api/session/${id}/export.csv`,
};

/** Box order is fixed and matches categorical palette slots 1..4. Never reorder. */
export const BOX_KEYS = ["box1", "box2", "box3", "box4"];

export const SERIES_VAR = {
  box1: "var(--series-1)",
  box2: "var(--series-2)",
  box3: "var(--series-3)",
  box4: "var(--series-4)",
};

/** Short labels for chart ends and table headers; the long names live in /api/config. */
export const SHORT_LABEL = {
  box1: "Bare metal",
  box2: "Coat only",
  box3: "SweatShell",
  box4: "Wet cloth",
};

export function fmt(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

export function clockOf(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
