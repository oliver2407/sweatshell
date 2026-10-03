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
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# dashboard (second terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`--reload` matters more than it looks. The browser picks up a `git pull` on its
own; the backend does not. Without it you end up with a new page talking to an
old API, buttons that do nothing, and no clue why. The app now says so when it
happens, but not restarting beats being told.

### Letting other people see it, live

Judges are not on your hotspot and `172.20.10.x` means nothing to them. Nothing
has to move: the roof unit stays where it is, this laptop stays on the hotspot
polling it, and a tunnel gives the backend's one port a public HTTPS address.

```bash
cd frontend && npm run build    # the backend serves this at /
./share.sh                      # prints a https://…trycloudflare.com link
```

Free, no account, no card. `cloudflared` is the only thing to install
(`brew install cloudflared`). `share.sh` checks the three things that are wrong
on the day — tunnel binary missing, frontend not built, backend not running —
and tells you whether the roof unit is answering before anyone looks, because a
tunnel to a backend that lost its device shows a frozen screen, which is worse
than no demo.

What the link costs you: the laptop has to stay awake, on the hotspot, with that
window open. The URL is random and changes every run, so start it before anyone
needs it. Everything is live — a judge pressing Roll up moves the real sheet.

This works because the backend serves the built frontend itself, so one origin
carries both the page and `/api`. Two origins would be two tunnels, two URLs to
read out, and CORS between them.

**If the venue has no usable network at all**, the fallback is the simulator:
`cd backend && python simulate.py --fast` fills the charts with plausible data,
and every reading it writes is tagged `sim` so it never mixes with measurements.
Say out loud that it is simulated — the app will not say it for you.

No hardware yet? The simulator posts to the same endpoints the ESP32 uses:

```bash
cd backend
python simulate.py --fast --session "Gel 3mm vs wet cloth"
```

`--fast` runs 60× real time, so a three-hour run fills the chart in about three
minutes. If the simulator works end to end, the firmware only has to produce the
same JSON.

Tests (the one that calls Open-Meteo skips itself when offline):

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

## How the pieces fit

The firmware on the roof unit is a **web server**, not a client — it serves `/data`
and takes commands on `/cmd`. The backend goes to it:

```
ESP32  <--GET /data----  FastAPI  --SQLite-->  /api/home  -->  app
       <--GET /cmd?a=--             (polled every 2s)
```

`backend/bridge.py` is the only file that knows both vocabularies. It polls the
device, translates each reading into the shape the rest of the app already uses, and
forwards any pending pump or roller command. No firmware change was needed and none
was made.

A device that posts to `/api/reading` instead still works; that path is unchanged and
the simulator uses it.

### One controller, not two

The firmware has its own auto mode — roll out above a temperature, roll up below
another, pump when the gel is dry. The backend has a schedule, a forecast and a wind
rule. Left both on they fight: the clock rolls the sheet out at 8am and the
thermostat rolls it straight back up because the morning is still cool, and neither
is wrong.

So when the bridge takes over it puts the device into manual mode. Set
`take_control: false` on `/api/bridge` to leave the device in charge instead — but
pick one.

### Connecting to the roof unit

The device prints its address on the serial monitor at boot. Open it in a browser
first — the firmware serves its own control page there, and if that page does not
load the problem is wifi, not this backend.

The address is editable in the app, under **Automatic → Connection** (it sits in the
open, next to the reason, whenever the unit is not answering). A bare
`172.20.10.2` is fine — the scheme is filled in.

If the address is unknown, go and find it rather than guessing:

```bash
cd backend && .venv/bin/python find_device.py --set
```

It knocks on every address on the subnets this machine is already on and reports
which one answers with a reading. `--set` points the backend at it.

The same change over HTTP, if the app is not up:

```bash
curl -X PATCH localhost:8000/api/bridge -H 'Content-Type: application/json' \
  -d '{"enabled":true,"url":"http://172.20.10.2"}'
```

`GET /api/bridge` says whether it is working. `connected` means the last poll
succeeded; `last_error` names what to go and look at rather than printing an
exception.

**Both machines have to be on the same wifi.** `172.20.10.x` is an iPhone
personal-hotspot subnet: the roof unit joins the hotspot, and a laptop that quietly
rejoined the house network is the most common way this looks broken when nothing is.

**The laptop is on that subnet too.** The phone is `172.20.10.1` and hands out `.2`
upward to everything that joins, laptop included — so an address read off the
laptop's own network settings looks exactly like the unit's and will never answer.
The unit's address comes from its serial output, or from `find_device.py`.

### Testing it without the hardware

`backend/fake_esp.py` serves the firmware's own JSON shape on a local port:

```bash
python fake_esp.py --port 8123
curl -X PATCH localhost:8000/api/bridge -H 'Content-Type: application/json' \
  -d '{"enabled":true,"url":"http://127.0.0.1:8123"}'
```

It exists so the bridge can be exercised on the bench, and so that when something
breaks it is possible to tell whether the device changed or the translation did.

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

The forecast comes from Open-Meteo (no API key): hourly gusts and weather codes for
a week, daily figures for sixteen days. Decisions are made per hour, not per day.
Melbourne gusts pass 40 km/h on most spring days, usually for a few afternoon hours,
so the daily maximum would keep the sheet up almost permanently. Instead the backend
finds each risky stretch (gusts over the threshold, thunderstorms, hail), merges
stretches less than three hours apart, and asks for the sheet up two hours before
and back out no sooner than an hour after. The daily schedule will not roll the sheet
out inside one of those windows, but only while rough-weather roll-up is turned
on; with it off, the forecast warns and never moves the sheet.

The same forecast suggests packing up for the year (a mild week, in autumn only) and
picks a dry, calm day for upkeep once it is due within a fortnight.

If Open-Meteo can't be reached, the app
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

## What the database holds

One SQLite file, `backend/sweatshell.db`. Four tables, and each is there because
losing it would cost something real:

| Table | Why it cannot live in memory |
|---|---|
| `readings` | The chart. Without it, reloading the page gives an empty graph |
| `settings` | The schedule, the watering threshold, the wind limit, when the sheet was last serviced, and where the roller is |
| `events` | What the controller decided and when — the evidence it decided anything |
| `sessions` | Named bench runs and their CSV export |

The `settings` table is the one that was missing. Those values used to be Python
dicts, so restarting the backend silently handed someone the factory schedule back
and told them their three-month-old sheet was brand new. Settings a person set are
data, not defaults.

Not in the database, on purpose: the pending pump or roller command, and which
schedule slot already fired today. Those are about this run, not this installation,
and a restart *should* forget them.

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

It is a two-column grid even at phone width. Anything with a date on it goes at the
top, because an alert three cards down is a log entry rather than a warning. Below
that sit the two numbers people open the app for — how warm it is inside, and how
much water is left — side by side, so the first screenful answers the daily question
without a scroll. Settings are folded away: they get set once and then forgotten, so
they do not belong between a person and their daily glance.

The app chart is one series — the temperature inside — with the stretches when the
sheet was rolled out shaded behind it in a tint of the same hue, so the band reads as
context rather than as a second series. One measure, one y-axis.

This build covers cooling only. There is no winter mode.

## Safety

Nothing on this rig touches mains voltage. The pump is 12 V on its own supply,
switched through a relay, grounds commoned with the ESP32. Do not pull pump current
through the board's 3V3 rail — it browns out, and you lose the last hour before
judging to a power fault that looks like a software bug.
