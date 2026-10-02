import ScheduleList from "./ScheduleList.jsx";

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
}) {
  const s = home.schedule;
  const p = home.protect;

  return (
    <>
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
              {s.enabled
                ? `${(s.windows ?? []).filter((w) => w.enabled).length} window${
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
