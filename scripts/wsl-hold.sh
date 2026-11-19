#!/usr/bin/env bash
# Helper for scripts/with-wsl.ps1 (I-24, D-048). Not meant to be run by hand.
#   wsl-hold.sh        sleep as a process named qapilot-hold, capped at one hour, so one WSL session stays open
#   wsl-hold.sh stop   end any qapilot-hold process left behind
if [ "${1:-}" = "stop" ]; then
  # [q] keeps pkill from matching its own command line
  pkill -f '[q]apilot-hold' || true
  exit 0
fi
exec -a qapilot-hold timeout 3600 sleep 3600
