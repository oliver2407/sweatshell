/*
 * The two things a person presses.
 *
 * Side by side and the same size, because neither is the primary action — it depends
 * entirely on what the roof is doing. Auto-watering sits underneath because it
 * changes what the left button means.
 */

export default function ActionsCard({ home, busy, onWater, onMove, onAuto }) {
  const watering = home.pump_on || home.pump_queued;

  return (
    <div className="card">
      <h2>Do something</h2>

      <div className="two">
        <button
          className="btn primary"
          disabled={busy || watering}
          onClick={onWater}
        >
          {watering ? "Watering…" : "Water now"}
        </button>
        <button
          className="btn"
          disabled={busy || home.sheet_moving}
          onClick={() => onMove(!home.sheet_out)}
        >
          {home.sheet_moving ? "Moving…" : home.sheet_out ? "Roll up" : "Roll out"}
        </button>
      </div>

      <div className="toggle">
        <span>Water automatically</span>
        <button
          className="switch"
          role="switch"
          aria-checked={home.auto_water}
          aria-label="Water automatically"
          disabled={busy}
          onClick={() => onAuto(!home.auto_water)}
        />
      </div>
    </div>
  );
}
