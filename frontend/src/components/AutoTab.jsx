import { useEffect, useState } from "react";
import ScheduleList from "./ScheduleList.jsx";

/*
 * The roof unit's own thresholds, which is what Auto on the control screen runs.
 *
 * They are edited here but they are not stored here — each change is written
 * through to the firmware, which owns them. A second copy in this app would be one
 * more thing that has to agree with the first.
 */
/*
 * Where the roof unit lives on the network.
 *
 * This is the setting that changes most often and it was the only one with no way
 * to change it: the unit joins a phone hotspot, the hotspot hands out a new address
 * every time either end restarts, and the app simply went quiet. Fixing it meant a
 * curl command, which is not a thing to be doing in front of an audience.
 */
function Address({ device, busy, onSet }) {
  const [draft, setDraft] = useState(null);
  const current = device?.url ?? "";
  const value = draft ?? current;
  const changed = value.trim() !== current;

  return (
    <div className="addr">
      <label className="addr-l" htmlFor="roof-url">
        Roof unit address
      </label>
      <div className="addr-row">
        <input
          id="roof-url"
          className="addr-in"
          type="url"
          inputMode="url"
          spellCheck="false"
          autoComplete="off"
          placeholder="http://172.20.10.2"
          disabled={busy}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          className="addr-go"
          disabled={busy || !changed || !value.trim()}
          onClick={() => {
            onSet(value.trim());
            setDraft(null);
          }}
        >
          Connect
        </button>
      </div>
      <p className="tiny">
        Printed on the unit’s serial output when it boots. On a phone hotspot it
        changes whenever the unit restarts, so if the app goes quiet, check it here
        first.
      </p>
    </div>
  );
}

/*
 * The one water level, sitting under the switch it belongs to.
 *
 * It is written to the roof unit as well as kept here, because both of them water —
 * the unit while it is deciding for itself, this app the rest of the time. The
 * person sets one number and does not have to know that.
 */
function WaterLevel({ pct, busy, onSet }) {
  const [draft, setDraft] = useState(null);
  const value = draft ?? String(Math.round(pct ?? 30));

  useEffect(() => setDraft(null), [pct]);

  const commit = () => {
    const n = Number(value);
    if (Number.isFinite(n) && n !== Math.round(pct ?? 30)) {
      onSet(Math.min(95, Math.max(5, Math.round(n))));
    }
    setDraft(null);
  };

  return (
    <label className="thr thr-sub">
      <span className="thr-l">Top it up below</span>
      <input
        type="number"
        step="1"
        min="5"
        max="95"
        disabled={busy}
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="thr-n">% water</span>
    </label>
  );
}

function DeviceThresholds({ device, busy, onPatch, onSetUrl }) {
  const s = device?.settings;
  const [draft, setDraft] = useState({});

  useEffect(() => setDraft({}), [s?.hot, s?.cool, s?.danger, s?.dry_pct]);

  if (!device?.connected || !s) {
    return (
      <div className="panel">
        <h2>Automatic by temperature</h2>
        <p className="warnline">
          {device?.error ?? "Not connected to the roof unit."}
        </p>
        <Address device={device} busy={busy} onSet={onSetUrl} />
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

      <details className="fold">
        <summary>Connection</summary>
        <Address device={device} busy={busy} onSet={onSetUrl} />
      </details>
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
  onSetUrl,
  onWaterThreshold,
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
        onSetUrl={onSetUrl}
      />

      <div className="panel">
        {/*
          One water level, one control.
          There were two: this switch watered below the app's own 30%, and a "top up
          below" field above wrote a different number onto the roof unit, which the
          unit only used while it was deciding for itself. The screen could read 76%
          and 30% at once for the same behaviour, with nothing saying which was in
          charge — and the honest answer was "both, in different circumstances".
          Setting it here now sets both.
        */}
        <div className="row">
          <div>
            <div className="lead">Water the sheet by itself</div>
            <div className="note">
              {home.auto_water
                ? "Tops it up when the gel dries out"
                : "Off — you water it by hand"}
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

        {home.auto_water && (
          <WaterLevel
            pct={home.water_threshold_pct}
            busy={busy}
            onSet={onWaterThreshold}
          />
        )}

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
