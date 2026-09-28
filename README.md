# SweatShell

A waste-derived roof covering, and the rig that measures whether it actually works.

Two layers. An **eggshell-powder reflective coat** bounces sunlight off the roof, and
a **sodium-alginate bio gel** sitting on top of it evaporates water and carries heat
away with it. An ESP32 watches the gel's mass and waters it when it dries out.

The point of this repository is not the coating. It is the **evidence**: four
identical mini houses under one heat lamp, logged continuously, exportable as CSV.

| Box | Roof | What it answers |
|---|---|---|
| 1 | Bare metal | The baseline. How hot does an uncoated roof get? |
| 2 | Eggshell coat only | How much of the cooling is just reflective paint? |
| 3 | Eggshell coat + bio gel | SweatShell itself. |
| 4 | Eggshell coat + wet cloth | **Does the gel beat a wet rag?** |

Box 4 is the important one and it is the one most demos would leave out. If a damp
tea towel cools the box as well as the gel does, the gel is not worth making, and we
would rather find that out on our own rig than from a judge.

## Running it

Two processes: a FastAPI backend and a Vite dashboard.

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

```bash
# dashboard (second terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

No hardware yet? The simulator posts to the same endpoints the ESP32 uses:

```bash
cd backend
python simulate.py --fast --session "Gel 3mm vs wet cloth"
```

`--fast` runs 60× real time, so a three-hour run fills the chart in about three
minutes. If the simulator works end to end, the firmware only has to produce the
same JSON.

## How the pieces fit

```
ESP32  --POST /api/reading-->  FastAPI  --SQLite-->  /api/state  -->  dashboard
       <--GET /api/pump/command--            (polled every 2s)
```

Polling, not MQTT or WebSockets. On venue wifi a dropped socket is a dead dashboard;
a dropped poll is 2 seconds of staleness. There is no broker to babysit.

The device holds no logic. Thresholds live in the backend, so changing when the gel
gets watered is a toggle on the dashboard rather than a reflash.

### Two audiences, two sets of endpoints

The app is for someone living with the product, checking it on their phone. It shows
how warm it is inside, whether the sheet needs water, where the sheet is and
everything that moves it, and when it next needs a look at. Nothing on that screen
needs interpreting.

It does **not** show a with/without comparison. In a real home there is no second
roof to compare against, and the honest version of that number needs about a week of
baseline data — log indoor and outdoor temperature with the sheet rolled up, fit
`indoor_max ≈ a + b × outdoor_max`, then compare measured against predicted (this is
IPMVP Option C). Until that exists, a comparison line on a resident's screen would be
a number nobody can stand behind.

The bench endpoints still return everything — per-box readings, the energy chain, the
assumptions behind it — for the team and for the CSV. They are simply not on the
resident's screen, because every extra number there is a question they have to answer
for themselves.

| Endpoint | Purpose |
|---|---|
| `GET /api/home` | **What the phone app shows.** Deliberately narrow |
| `GET /api/home/series` | Indoor temperature, plus whether the sheet was out at each point |
| `POST /api/reading` | The ESP32 (or simulator) posts one sample |
| `GET /api/pump/command` | Device asks whether to water; returns and clears the request |
| `POST /api/pump` | Manual watering |
| `GET /api/sheet/command` | Roller asks whether to move; returns and clears |
| `POST /api/sheet?out=` | Roll the sheet out or up |
| `PATCH /api/schedule` | Daily roll-out / roll-up times |
| `PATCH /api/protect` | Wind threshold, and whether to act without asking |
| `GET /api/forecast` | Forecast with its provenance: live, cache or sample |
| `POST /api/maintenance/done` | Reset the upkeep countdown |
| `GET /api/state` | Bench view: everything, in one call |
| `GET /api/series` | Bench time series, thinned to 400 points |

### What moves the sheet

Three things, in the order a person reaches for them: **the buttons**, which always
win; a **daily schedule**, because the sheet's useful moves are slow and predictable
and a roof covering takes hours to change the temperature inside — reacting to an
indoor thermometer would always be acting too late; and a **protective roll-up** from
the forecast, because wind that could tear the sheet has to be acted on before it
arrives and nothing on the roof can see it coming.

The forecast comes from Open-Meteo (no API key). If it can't be reached, the app
falls back to the last good forecast and then to a bundled sample, and it says on
screen which one you are looking at. The default gust threshold of 40 km/h is a
placeholder taken from retractable-awning practice — measure it against the actual
fabric and fixings before trusting it.

Protective roll-up **warns by default and does not act** unless the person turns that
on. A forecast can be wrong, and an unexpected motor movement on someone's roof is
not a good surprise.
| `POST /api/session/start`, `POST /api/session/{id}/stop` | Named runs |
| `GET /api/session/{id}/export.csv` | Raw data a judge can take away and check |
| `POST /api/scale` | Projects the measured water cost onto a real roof |
| `GET /api/assumptions` | Every constant behind the cooling numbers |

## The cooling maths, and where it could be wrong

Everything on the "what the water bought" panel derives from one measured quantity:
grams of water that left the gel, from the load cell.

```
heat removed (kJ)   = grams × 2.45          # latent heat of vaporisation
AC electricity (kWh) = kJ ÷ 3600 ÷ COP      # COP assumed 3.0
CO2 avoided (kg)     = kWh × 0.79           # grid intensity
```

**The ÷COP is the step people get wrong.** An air conditioner moves roughly three
units of heat per unit of electricity, so the electricity saved is the heat removed
divided by three, not equal to it. Leaving it out overstates the result threefold.

Only mass *decreases* count as evaporation. A refill makes the scale jump up, and
counting that would inflate the total every time the pump fires.

Assumptions we state on the dashboard rather than bury:

- All mass lost from the gel is assumed to have left as water vapour.
- Evaporative cooling weakens as humidity rises. Humidity is logged alongside so the
  weakening is visible in the data rather than hidden in an average.
- **A heat lamp is not the sun.** No UV, and indoors there is no cold sky for the
  roof to radiate to. We make no radiative-cooling claim from this rig.

### The water question

The first serious objection to a sweating roof in Australia is water, and the only
honest reply is a number. The dashboard reports **litres per °C per hour**, measured
against the gel-vs-coat delta specifically, because the reflective coat costs no
water at all. The scale calculator projects that onto a real roof and a real
rainwater tank, and it is allowed to return a bad answer — if a 5,000 L tank does not
cover a season, it says so.

Sweat mode is meant for extreme-heat days, fed from a tank. Running it every summer
day is not the proposal.

## Calibrate before you believe anything

Three numbers make or break the rig:

1. **`gel_full_mass_g` / `gel_dry_mass_g`** in `backend/main.py`. Weigh the pad
   soaking wet, oven-dry it, weigh it again. Guessing makes the water gauge
   meaningless and every derived figure with it.
2. **`HX711_SCALE`** in the firmware. Put a known mass on the tray (a 500 mL bottle
   is 500 g), read raw, divide by grams.
3. **The DS18B20 addresses.** Probes enumerate in an arbitrary order. Set
   `PRINT_ADDRESSES true`, warm one probe at a time, and record which address moves.
   Skip this and box 3 quietly reports box 1's temperature.

Also set `gel_area_m2` in the backend config to the real pad area, or the scale
projection is arithmetic on a guess.

## Repository

```
backend/    FastAPI + SQLite. cooling.py holds every physics constant.
frontend/   Vite + React app, phone first. No chart library; the SVG is hand-drawn.
firmware/   ESP32 sketch (Arduino).
```

The app is built for a 390px screen and scales up from there, because people check
this on a phone. Tap targets are at least 44px.

The app chart is one series — the temperature inside — with the stretches when the
sheet was rolled out shaded behind it in a tint of the same hue, so the band reads as
context rather than as a second series. One measure, one y-axis.

This build covers cooling only. There is no winter mode.

## Safety

Nothing on this rig touches mains voltage. The pump is 12 V on its own supply,
switched through a relay, grounds commoned with the ESP32. Do not pull pump current
through the board's 3V3 rail — it browns out, and you lose the last hour before
judging to a power fault that looks like a software bug.
