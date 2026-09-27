import { clockOf } from "../api.js";

/*
 * Event log.
 *
 * Its job at judging time is to prove the controller decided something on its own.
 * "The gel dropped to 28% and it watered itself" is the difference between a sensor
 * and a system.
 */

const TONE = {
  pump: "var(--status-good)",
  session: "var(--series-1)",
  config: "var(--text-muted)",
  error: "var(--status-critical)",
};

export default function EventLog({ events }) {
  return (
    <div className="card">
      <h2>What the controller did</h2>
      {!events?.length ? (
        <p className="note" style={{ margin: 0 }}>
          Nothing yet. Watering decisions and run start/stop show up here.
        </p>
      ) : (
        <ul className="events">
          {events.map((e) => (
            <li key={e.id}>
              <span className="when">{clockOf(e.ts)}</span>
              <span
                className="dot"
                style={{
                  background: TONE[e.kind] ?? "var(--text-muted)",
                  marginTop: 8,
                }}
              />
              <span className="what">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
