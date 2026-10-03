# SweatShell

A roof covering made from waste, and the app a household uses to run it.

Two layers on a roll-up sheet. An **eggshell-powder reflective coat** bounces sunlight
off the roof before it becomes heat, and a **sodium-alginate bio gel** on top of it
evaporates water and carries heat away with it — the same trick as sweating. An ESP32
on the roof watches the temperature, rolls the sheet out when the day turns hot, and
waters the gel when it dries.

Eggshell is a waste stream. Hatcheries, bakeries and restaurants pay to throw it out.
The gel recharges with plain water, so once the sheet is on the roof the running cost
is close to nothing — which is the whole reason this is aimed at farmers rather than
at anyone who could simply buy an air conditioner.

---

## What you actually see

One screen, built for a phone, because that is what people check.

- **The temperature inside**, in the middle, because it is the number the product
  exists to change.
- **Manual or Auto**, as a two-way switch. Auto hands the decision to the roof unit's
  own thresholds — it watches the air *outside*, which warms before the house does,
  so the sheet is already out by the time the heat arrives.
- **Where the sheet is**, written in words from the device's own report, so it stays
  true when nobody has pressed anything.
- **Roll out / Roll up / Water now**, which take control back the moment you touch
  them.
- **A schedule**, if you want hours instead of thresholds, with daily, weekly and
  monthly repeats.
- **Rough-weather roll-up**, driven by a wind-gust forecast, so the sheet is not out
  in the storm that would tear it.

---

## Running it

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

```bash
# frontend, second terminal
cd frontend
npm install
npm run dev          # http://localhost:5173
```

`--reload` matters more than it looks. The browser picks up a `git pull` on its own;
the backend does not. Without it you get a new page talking to an old API, buttons
that do nothing, and no clue why.

### Connecting to the roof unit

The device prints its address on the serial monitor at boot. Open that address in a
browser first — the firmware serves its own page there, and if that page does not
load, the problem is wifi, not this backend.

The address is editable in the app under **Automatic → Connection**. A bare
`172.20.10.2` is fine; the scheme is filled in. If the address is unknown:

```bash
cd backend && .venv/bin/python find_device.py --set
```

It knocks on every address on the subnets this machine is already on and reports
which one answers with a SweatShell reading.

**Both machines have to be on the same wifi**, and the laptop shares the unit's
subnet. The phone is `172.20.10.1` and hands out `.2` upward to everything that
joins, laptop included — so an address read off the laptop's own network settings
looks exactly like the unit's and will never answer.

### Letting other people see it, live

Judges are not on your hotspot. Nothing has to move: the roof unit stays where it is,
the laptop stays on the hotspot polling it, and a tunnel gives the backend's one port
a public HTTPS address.

```bash
cd frontend && npm run build    # the backend serves this at /
./share.sh                      # prints a https://…trycloudflare.com link
```

Free, no account. `cloudflared` is the only thing to install. `share.sh` checks the
three things that are actually wrong on the day and says whether the roof unit is
answering *before* anyone looks — a tunnel to a backend that lost its device shows a
frozen screen, which is worse than no demo.

The laptop has to stay awake with that window open, and the URL changes every run.

### A link that works without any of this

`share.sh` needs the laptop awake and the tunnel open, which is right for a demo
someone is standing next to and wrong for a link that has to work at midnight when a
judge gets round to it.

So the app also builds in **demo mode**: `frontend/src/demo.js` answers the same calls
`api.js` makes, out of a model running in the page. Every button works, the numbers
move, the chart fills, the schedule editor edits. It is static hosting — nothing to
keep awake and nothing to reach.

```bash
cd frontend && npm run build:demo     # dist/ is then a self-contained app
```

Deploying it to Vercel, once:

1. **Add New → Project**, import the repository.
2. **Root Directory: `frontend`** — this is the only setting that matters, and the
   only one people get wrong. Vercel otherwise looks at the repo root, finds no
   `package.json`, and fails.
3. Leave everything else alone. `frontend/vercel.json` already sets the demo build
   and the single-page rewrite.
4. Deploy. Every push to `main` redeploys.

The numbers are invented and the app says so: a **DEMO DATA** badge sits in the header
on every screen with no way to dismiss it. That is not optional politeness — anyone who
presses a button twice and sees the same thing happen works it out anyway, at a worse
moment.

**This cannot be deployed with live data, by any host.** The roof unit sits on a phone
hotspot with a private address; no server on the internet has a route to it. Reaching
a real sensor from a hosted app would mean inverting the firmware so the device pushes
outward — `/api/reading` and `/api/sheet/command` are still there for exactly that —
and a host that runs a process continuously, which Vercel does not.

### Without the hardware

`backend/fake_esp.py` serves the firmware's own JSON shape on a local port, so the
whole app can be run and tested with no rig on the bench. `backend/simulate.py` fills
the charts with plausible data. Every reading the simulator writes is tagged `sim` and
the app's main screen never charts it — but the app will not announce that the data is
invented, so say it out loud.

---

## How the pieces fit

```
   ESP32 (HTTP server)  ──/data──►  bridge.py  ──►  SQLite  ──►  /api/home  ──►  app
         on the roof    ◄──/cmd───   polling
```

The firmware is a **server**: it holds the sensors and the motor and answers requests.
The app is a **client** that wants to be told things. `backend/bridge.py` is the only
file that speaks both vocabularies — it polls the device, translates its field names,
and hands commands back. Everything else on either side is written as if the other
did not exist.

Polling, not sockets, start to finish. A dropped poll is two seconds of staleness; a
dropped socket on venue wifi is a dead screen.

### One controller, not two

The roof unit's thresholds and the app's clock are **alternatives, not layers**. While
the device is deciding, the schedule stands down entirely — otherwise the clock rolls
the sheet out at 8am and the thermostat rolls it straight back up because the morning
is still cool, and neither of them is wrong.

Thresholds are stored on the roof unit itself, so they survive the app being closed.
The app writes them through and then **checks the device's own readback**, because a
setting that reads as saved and is not is worse than one that refuses.

---

## What is measured, and what is not

Judges ask this, and the honest answer is short.

**Measured, by a sensor:**

| On screen | Source |
|---|---|
| Temperature inside | DS18B20 |
| Outside | DS18B20 |
| Sheet out / rolled up | the firmware's roller state |
| Watering | the firmware's pump state |

**Derived from constants nobody has calibrated yet:**

- **Litres used today.** Moisture percent is converted to a gel mass against
  `gel_full_mass_g` and `gel_dry_mass_g`, which ship as defaults. Until someone weighs
  the pad wet and dry, this figure and everything derived from it is a placeholder.
- **Water percent.** The sensor is real; the percentage depends on
  `moist_dry_raw` / `moist_wet_raw` in the firmware, which need calibrating in actual
  gel.
- **Days to next check.** A 90-day countdown, not the result of a durability test.
- **The forecast.** Live from Open-Meteo when `forecast_source` says `live`. When it
  says `sample`, the weather shown is a built-in sample and the storm warning means
  nothing. The app says which.

### Calibrate before you believe anything

```bash
curl -X PATCH localhost:8000/api/config -H 'Content-Type: application/json' \
  -d '{"gel_dry_mass_g": 0, "gel_full_mass_g": 0}'   # your two weighings
```

A DS18B20 is accurate to about ±0.5 °C. Any claim resting on a smaller difference
than that is the sensors disagreeing, not the product working.

---

## Repository

```
backend/
  main.py          API, schedule, protective roll-up, serves the built frontend
  bridge.py        the only file that speaks both the device's and the app's dialects
  db.py            SQLite, one locked connection, readings tagged by source
  forecast.py      Open-Meteo, with cache and sample fallback
  fake_esp.py      stand-in for the roof unit, speaking its exact JSON
  simulate.py      invented data for a dead bench, tagged "sim"
  find_device.py   finds the roof unit on the local subnets
frontend/
  src/api.js       every call the app makes, live or demo
  src/demo.js      the model that answers them when there is no backend
                   React, hand-drawn SVG charts, no chart library
firmware/          Arduino sketches for the ESP32
tests/             schedule logic, device settings, the home window, db concurrency
share.sh           puts the live rig on a public URL
```

Run the tests with the venv from `backend/`:

```bash
.venv/bin/python ../tests/test_schedule.py
.venv/bin/python ../tests/test_device_settings.py
.venv/bin/python ../tests/test_home_window.py
.venv/bin/python ../tests/test_db_concurrency.py
```

---

## Safety

Water and mains electricity share a roof here. The pump and the roller motor run at
12 V from a supply that stays indoors; nothing at mains voltage goes up with the
sheet. The roller has limit switches because a motor that does not know where the end
is will tear the sheet off its mounting.

The gel is sodium alginate and calcium chloride — food-industry chemistry, not a
hazard — but a wet sheet is heavy and a roof is a roof. Fix the mounting to the
structure, not to the tiles.
