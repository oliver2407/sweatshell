#!/usr/bin/env bash
#
# Put the live rig on a public URL so judges can open it from anywhere.
#
# Nothing moves. The roof unit stays on the hotspot, this laptop stays on the
# hotspot polling it, and a tunnel gives that one backend port a public HTTPS
# address. Judges open a link; the numbers on their screen are the ones the sensors
# are reporting right now, and the buttons work.
#
#     ./share.sh
#
# Needs cloudflared, which is free and needs no account:
#   macOS    brew install cloudflared
#   Linux    https://pkg.cloudflare.com  (or the .deb from the GitHub releases page)
#
# The URL is random and changes every run, so start this before anyone needs it and
# leave it running. Ctrl-C takes the link down.

set -u
cd "$(dirname "$0")"

say() { printf '%s\n' "$*"; }
fail() { printf '\n  %s\n\n' "$*" >&2; exit 1; }

# --- the three things that are actually wrong on the day ----------------------

command -v cloudflared >/dev/null 2>&1 || fail \
  "cloudflared is not installed. macOS: brew install cloudflared"

[ -f frontend/dist/index.html ] || fail \
  "The frontend is not built. Run: cd frontend && npm run build"

if ! curl -fsS --max-time 4 http://127.0.0.1:8000/api/home >/dev/null 2>&1; then
  fail "Nothing is answering on port 8000. Start the backend first:
    cd backend && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000"
fi

# --- is the roof unit actually answering? -------------------------------------
#
# A tunnel to a backend that lost the device shows judges a frozen screen, which
# looks worse than no demo. Worth knowing thirty seconds before they look, not
# thirty seconds after.

state=$(curl -fsS --max-time 4 http://127.0.0.1:8000/api/bridge 2>/dev/null)
if printf '%s' "$state" | grep -q '"connected": *true'; then
  say "Roof unit:  answering"
else
  reason=$(printf '%s' "$state" | sed -n 's/.*"last_error": *"\([^"]*\)".*/\1/p')
  say "Roof unit:  NOT answering${reason:+ — $reason}"
  say "            The page will still open, showing the last reading that arrived."
  say "            Fix it with: cd backend && .venv/bin/python find_device.py --set"
fi

say "Frontend:   built"
say "Backend:    up on :8000"
say ""
say "Opening the tunnel. The https://…trycloudflare.com line below is the link to"
say "give out. Keep this window open — closing it closes the link."
say ""

exec cloudflared tunnel --url http://127.0.0.1:8000
