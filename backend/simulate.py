"""
Fake rig. Generates plausible four-box data so the dashboard can be built and
demoed before the hardware exists, and so there is a fallback if a probe dies
five minutes before judging.

    python simulate.py                 # real time, 2s per reading
    python simulate.py --fast          # 60x, fills a chart in seconds
    python simulate.py --session "Gel 3mm vs wet cloth"

It posts to the same /api/reading endpoint the ESP32 uses, and polls the same
/api/pump/command. If the simulator works end to end, the firmware only has to
produce the same JSON.
"""

import argparse
import math
import random
import time

import httpx

API = "http://127.0.0.1:8000"

# Steady-state roof temperatures under the lamp, in C. Ordered the way we expect
# the physics to order them; the sim must not be what proves the hypothesis, so
# these come from rough expectations and get replaced by real measurements.
ROOF_TARGET = {
    "box1": 68.0,  # bare metal: the oven
    "box2": 50.0,  # eggshell coat reflects a chunk of it
    "box3": 41.0,  # coat + sweating gel
    "box4": 44.0,  # coat + wet cloth: close to the gel, which is the honest risk
}

AMBIENT_START = 24.0
# Time constant for inside air chasing the roof, in seconds. Used in an
# exponential step, not a raw multiply: at --fast the timestep is 120s, and a
# plain `x += (target - x) * k * dt` overshoots and diverges once k*dt > 2.
INSIDE_TAU_S = 300.0
GEL_AREA_M2 = 0.06  # the pad in the sim; keep in step with backend config


class Rig:
    def __init__(self, full_mass: float = 300.0, dry_mass: float = 120.0):
        self.t = 0.0
        self.ambient = AMBIENT_START
        self.humidity = 42.0
        self.roof = {b: AMBIENT_START for b in ROOF_TARGET}
        self.inside = {b: AMBIENT_START for b in ROOF_TARGET}
        self.full_mass = full_mass
        self.dry_mass = dry_mass
        self.gel_mass = full_mass
        self.cloth_wet = True
        self.pump_on = False
        self.pump_until = 0.0
        self.sheet_out = True

    def step(self, dt: float) -> None:
        self.t += dt

        # Lamp warms the room slowly, plateauing a few degrees above where it started.
        self.ambient = AMBIENT_START + 6.0 * (1 - math.exp(-self.t / 900.0))

        water_pct = self.water_pct()

        for box, target in ROOF_TARGET.items():
            eff = target

            # A dry pad stops sweating, so box3 drifts back toward the coat-only case.
            # A sheet rolled up off the roof does nothing at all, which is the point
            # of showing the roll control in the app rather than hiding it.
            if box == "box3":
                dryness = 1.0 if not self.sheet_out else 1.0 - (water_pct / 100.0)
                eff = target + (ROOF_TARGET["box2"] - target) * dryness
            # The cloth dries faster than the gel: that is the gel's whole selling point.
            if box == "box4" and not self.cloth_wet:
                eff = ROOF_TARGET["box2"] + 1.0

            eff += self.ambient - AMBIENT_START
            # First-order approach to the target, plus a little sensor noise.
            self.roof[box] += (eff - self.roof[box]) * (1 - math.exp(-dt / 120.0))
            self.roof[box] += random.gauss(0, 0.15)

            inside_target = self.ambient + (self.roof[box] - self.ambient) * 0.42
            self.inside[box] += (inside_target - self.inside[box]) * (
                1 - math.exp(-dt / INSIDE_TAU_S)
            )
            self.inside[box] += random.gauss(0, 0.08)

        # Evaporation scales with how hot the pad is and how dry the air is.
        if self.gel_mass > self.dry_mass:
            drive = max(0.0, self.roof["box3"] - self.ambient)
            dryness = max(0.05, 1.0 - self.humidity / 100.0)
            rate = 0.0042 * drive * dryness  # grams per second
            self.gel_mass = max(self.dry_mass, self.gel_mass - rate * dt)
            # Water leaving the pad goes into the room, which throttles further evaporation.
            self.humidity = min(85.0, self.humidity + rate * dt * 0.02)
        else:
            self.humidity = max(35.0, self.humidity - 0.002 * dt)

        # The cloth holds roughly a third of what the gel does.
        if self.cloth_wet and self.t > 1800:
            self.cloth_wet = False

        if self.pump_on and time.time() > self.pump_until:
            self.pump_on = False

    def water_pct(self) -> float:
        span = self.full_mass - self.dry_mass
        return max(0.0, min(100.0, (self.gel_mass - self.dry_mass) / span * 100.0))

    def water(self, seconds: float) -> None:
        self.pump_on = True
        self.pump_until = time.time() + seconds
        # ~14 g of water per second of pump run.
        self.gel_mass = min(self.full_mass, self.gel_mass + 14.0 * seconds)
        self.cloth_wet = True

    def payload(self, ts: float | None = None) -> dict:
        return {
            # Say so. These numbers are invented, they land in the same table as
            # measured ones, and a 40° that nobody measured turning up on a
            # resident's chart beside a 22° that a sensor did is how an afternoon
            # gets spent looking for a hardware fault that was never there.
            "source": "sim",
            "roof": {k: round(v, 2) for k, v in self.roof.items()},
            "inside": {k: round(v, 2) for k, v in self.inside.items()},
            "gel_mass_g": round(self.gel_mass, 1),
            "ambient_c": round(self.ambient, 2),
            "humidity": round(self.humidity, 1),
            "pump_on": self.pump_on,
            "sheet_out": self.sheet_out,
            "ts": ts,
        }


def main() -> None:
    ap = argparse.ArgumentParser(description="SweatShell fake rig")
    ap.add_argument("--api", default=API)
    ap.add_argument("--interval", type=float, default=2.0, help="seconds between posts")
    ap.add_argument(
        "--fast", action="store_true", help="60x simulated time, for filling charts"
    )
    ap.add_argument("--session", help="start a named recording session first")
    ap.add_argument("--minutes", type=float, default=0, help="stop after N simulated minutes")
    args = ap.parse_args()

    speed = 60.0 if args.fast else 1.0
    sim_dt = args.interval * speed
    sleep = 0.05 if args.fast else args.interval

    with httpx.Client(base_url=args.api, timeout=5.0) as client:
        try:
            client.get("/api/health").raise_for_status()
        except Exception as exc:
            raise SystemExit(
                f"Cannot reach the API at {args.api}. Start it first:\n"
                f"  cd backend && uvicorn main:app --reload\n({exc})"
            )

        cfg = client.get("/api/config").json()
        rig = Rig(cfg["gel_full_mass_g"], cfg["gel_dry_mass_g"])

        if args.session:
            s = client.post("/api/session/start", json={"label": args.session}).json()
            print(f"Recording session {s['id']}: {s['label']}")

        print(f"Posting to {args.api} every {sleep}s at {speed:.0f}x. Ctrl-C to stop.")
        # Stamp readings with simulated time, not wall clock. Under --fast an hour of
        # drying happens in a couple of real seconds, and without this the backend
        # computes "0.001 hours elapsed" and the litres-per-degree-per-hour figure —
        # the number that answers the water objection — comes out as null.
        t0 = time.time()
        try:
            while True:
                rig.step(sim_dt)
                client.post("/api/reading", json=rig.payload(ts=t0 + rig.t))

                cmd = client.get("/api/pump/command").json()
                if cmd.get("pump"):
                    secs = cmd.get("seconds", 5)
                    rig.water(secs)
                    print(f"  pump {secs}s -> gel back to {rig.water_pct():.0f}%")

                move = client.get("/api/sheet/command").json().get("move")
                if move:
                    rig.sheet_out = move == "out"
                    print(f"  sheet rolled {'out' if rig.sheet_out else 'up'}")

                print(
                    f"t+{rig.t/60:6.1f}m  "
                    f"roof {rig.roof['box1']:.1f}/{rig.roof['box2']:.1f}/"
                    f"{rig.roof['box3']:.1f}/{rig.roof['box4']:.1f}  "
                    f"gel {rig.water_pct():5.1f}%  rh {rig.humidity:.0f}%"
                )

                if args.minutes and rig.t >= args.minutes * 60:
                    break
                time.sleep(sleep)
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
