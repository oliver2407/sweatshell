import { useEffect, useState } from "react";
import ScheduleList from "./ScheduleList.jsx";

/*
 * The roof unit's own thresholds, which is what Auto on the control screen runs.
 *
 * They are edited here but they are not stored here — each change is written
 * through to the firmware, which owns them. A second copy in this app would be one
 * more thing that has to agree with the first.
 */
function DeviceThresholds({ device, busy, onPatch }) {
  const s = device?.settings;
  const [draft, setDraft] = useState({});

  useEffect(() => setDraft({}), [s?.hot, s?.cool, s?.danger, s?.dry_pct]);

  if (!device?.connected || !s) {
    return (
      <div className="panel">
        <h2>Automatic by temperature</h2>
        <p>
          Not connected to the roof unit, so its thresholds can’t be read or changed
          from here.
        </p>
      </div>
    );
  }

  const field = (key, label, value, note, step = "0.5") => (
    <label className="thr">
      <span className="thr-l">{label}</span>
      <input
        type="number"
        step={step}
        disabled={busy}
        value={draft[key] ?? value}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        onBlur={() =>
          draft[key] !== undefined &&
          Number(draft[key]) !== Number(value) &&
          onPatch({ [key]: Number(draft[key]) })
        }
      />
      <span className="thr-n">{note}</span>
    </label>
  );

  return (
    <div className="panel">
      <h2>Automatic by temperature</h2>
      <p>
        What the roof unit decides on its own when Auto is on. It watches the air
        outside, which warms before the house does, so the sheet is already out by
        the time the heat arrives.
      </p>

      <div className="thrs">
        {field("hot", "Roll out above", s.hot, "°C outside")}
        {field("cool", "Roll up below", s.cool, "°C outside")}
        {field("danger", "Only sweat above", s.danger, "°C")}
        {field("dry", "Top up below", s.dry_pct, "% water", "1")}
      </div>

      {/*
        A number here is only saved once the roof unit reports it back. Until that
        check existed, a device that ignored the request still left the app saying
        "saved" — and the old value quietly reappeared a poll later with nothing to
        explain it.
      */}
      {device.settings_error ? (
        <p className="tiny warnline">{device.settings_error}</p>
      ) : (
        <p className="tiny">
          Saved onto the roof unit itself — each one is read back from it to confirm
          it landed, so these survive a restart of this app and apply even if it is
          closed.
        </p>
      )}
    </div>
  );
}

/*
 * Everything the system does without being asked.
 *
 * Each switch carries a line saying what it will actually do, because "Auto" on its
 * own is a promise with no terms. The weather switch says what happens when it is
 * off too — it still warns, it just will not move the roller — since the difference
 * between "off" and "does nothing" is the whole point of having it.
 *
 * There is deliberately no "roll out when it gets hot inside". A roof covering takes
 * hours to change the temperature indoors, so by the time a thermostat crossed a
 * threshold the heat would already be in the house. The clock is the right
 * controller here and a thermostat is not.
 */

export default function AutoTab({
  home,
  busy,
  onSchedule,
  onProtect,
  onAutoWater,
  onWindowPatch,
  onWindowAdd,
  onWindowDelete,
  onDeviceSettings,
}) {
  const s = home.schedule;
  const p = home.protect;
  const deviceDriving = home.device?.mode === "auto";

  return (
    <>
      <DeviceThresholds
        device={home.device}
        busy={busy}
        onPatch={onDeviceSettings}
      />

      <div className="panel">
        <div className="row">
          <div>
            <div className="lead">Water the sheet by itself</div>
            <div className="note">
              Tops it up below {Math.round(home.water_threshold_pct ?? 30)}%
            </div>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={home.auto_water}
            aria-label="Water the sheet by itself"
            disabled={busy}
            onClick={() => onAutoWater(!home.auto_water)}
          />
        </div>

        <div className="row">
          <div>
            <div className="lead">Roll on a schedule</div>
            <div className="note">
              {deviceDriving
                ? "Standing by — the roof unit is deciding by temperature"
                : s.enabled
                ? `${(s.windows ?? []).filter((w) => w.enabled).length} time${
                    (s.windows ?? []).filter((w) => w.enabled).length === 1 ? "" : "s"
                  } set`
                : "Set the hours the sheet should be out"}
            </div>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={s.enabled}
            aria-label="Roll on a schedule"
            disabled={busy}
            onClick={() => onSchedule({ enabled: !s.enabled })}
          />
        </div>

        {s.enabled && (
          <ScheduleList
            schedule={s}
            busy={busy}
            onPatch={onWindowPatch}
            onAdd={onWindowAdd}
            onDelete={onWindowDelete}
          />
        )}

        <div className="row">
          <div>
            <div className="lead">Roll up in rough weather</div>
            <div className="note">
              Gusts over {Math.round(p.wind_gust_kmh)} km/h. Off still warns you, it
              just won’t move the roller.
            </div>
          </div>
          <button
            className="switch"
            role="switch"
            aria-checked={p.auto}
            aria-label="Roll up in rough weather"
            disabled={busy}
            onClick={() => onProtect({ auto: !p.auto })}
          />
        </div>
      </div>

      {p.forecast_source !== "live" && (
        <div className="panel">
          <h2>Weather</h2>
          <p>
            {p.forecast_source === "cache"
              ? "Showing the last forecast that came through, not a live one."
              : "No weather data has reached this device, so the forecast below it is a sample. Rough-weather roll-up can’t be trusted until this says live."}
          </p>
        </div>
      )}
    </>
  );
}
