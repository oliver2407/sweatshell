"""
Find the roof unit on this network.

The unit joins a phone hotspot, which hands out a new address every time either end
restarts, and the address is only ever printed once — on the serial monitor, at boot,
usually when nobody is looking. Everything after that is guesswork, and the guess
that costs the most time is confusing the laptop's own address for the unit's: both
are 172.20.10.x, both look right, and one of them will never answer.

So: knock on every address on this machine's own subnets and see which one answers
with a SweatShell reading.

    .venv/bin/python find_device.py              # look, and print what you find
    .venv/bin/python find_device.py --set        # ...and point the backend at it
    .venv/bin/python find_device.py 192.168.1    # look on a subnet you name instead

It only probes the /24s this machine is already on, so it cannot wander off onto
someone else's network.
"""

import argparse
import socket
import sys
from concurrent.futures import ThreadPoolExecutor

import httpx

BACKEND = "http://127.0.0.1:8000"
TIMEOUT = 1.2


def my_addresses() -> list[str]:
    """Every IPv4 address this machine holds, including the hotspot one."""
    found = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except socket.gaierror:
        pass
    # getaddrinfo misses the hotspot interface on plenty of setups. Opening a UDP
    # socket toward the gateway costs nothing and reports the address that would
    # actually be used to reach it.
    for probe in ("172.20.10.1", "8.8.8.8"):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect((probe, 1))
            found.add(s.getsockname()[0])
        except OSError:
            pass
        finally:
            s.close()
    return sorted(a for a in found if not a.startswith("127."))


def looks_like_the_unit(d) -> bool:
    """The same shape guard the bridge uses, for the same reason."""
    return isinstance(d, dict) and "temps" in d and "roller" in d


def probe(host: str, port: int = 80):
    url = f"http://{host}" if port == 80 else f"http://{host}:{port}"
    try:
        r = httpx.get(f"{url}/data", timeout=TIMEOUT)
        if r.status_code != 200:
            return None
        d = r.json()
    except Exception:
        return None
    if not looks_like_the_unit(d):
        return ("other", url, f"answered, but not a reading")
    return ("unit", url, f"mode {d.get('mode')}, roller {d.get('roller', {}).get('state')}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("subnet", nargs="?", help="a /24 to scan, e.g. 192.168.1")
    ap.add_argument("--set", action="store_true", help="point the backend at what is found")
    ap.add_argument("--port", type=int, default=80, help="the unit serves on 80; only change this if yours does not")
    args = ap.parse_args()

    mine = my_addresses()
    if args.subnet:
        subnets = [args.subnet.rstrip(".")]
    else:
        subnets = sorted({a.rsplit(".", 1)[0] for a in mine})

    if not subnets:
        print("This machine has no network address to scan from.")
        return 1

    print("this machine is:", ", ".join(mine) or "(nothing found)")
    print("scanning:", ", ".join(f"{s}.1-254" for s in subnets))
    print()

    hosts = [f"{s}.{i}" for s in subnets for i in range(1, 255)]
    units, others = [], []
    with ThreadPoolExecutor(max_workers=120) as pool:
        for res in pool.map(lambda h: probe(h, args.port), hosts):
            if not res:
                continue
            (units if res[0] == "unit" else others).append(res)

    for _, url, note in others:
        print(f"  {url}  — {note}")

    if not units:
        print("  nothing on this network answered with a SweatShell reading.")
        print()
        print("If the unit is powered and its serial output shows an address, this")
        print("machine is on a different network than the unit — rejoin the hotspot.")
        return 1

    for _, url, note in units:
        marker = " <- the roof unit" if len(units) == 1 else " <- a roof unit"
        print(f"  {url}  — {note}{marker}")
    print()

    if not args.set:
        print("Run again with --set to point the backend at it.")
        return 0

    url = units[0][1]
    try:
        r = httpx.patch(f"{BACKEND}/api/bridge", json={"url": url}, timeout=5.0)
        r.raise_for_status()
    except Exception as exc:
        print(f"Found it, but could not reach the backend at {BACKEND}: {exc}")
        print(f"Start the backend, then set it by hand in the app's Automatic tab: {url}")
        return 1
    print(f"Backend now polling {url}. The app reconnects within a few seconds.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
