#!/usr/bin/env bash
#
# Put the installed app back in its first-launch state, to test the demo seed.
#
# An installed app seeds the bundled demo only when its data folder doesn't
# exist (seedDemo in src/server/index.ts), so a first launch is reproduced by
# taking that folder away, along with state.json beside it and the webview's
# storage (the appearance cookie). Electrobun's own com.sukulinja.app folder is
# left alone: it holds the self-extractor's bookkeeping, not app state.
#
# The first reset moves the real state to a .bak beside each location; later
# resets just delete the test state, never touching the backup. --restore puts
# the backup back.
#
# Usage: bun reset:install [--restore]
set -euo pipefail

TARGETS=(
  "$HOME/Library/Application Support/Sukulinja"
  "$HOME/Library/WebKit/com.sukulinja.app"
)

if pgrep -f "/Sukulinja.app/Contents/MacOS/" >/dev/null; then
  echo "reset-install: Sukulinja is running — quit it first" >&2
  exit 1
fi

if [[ "${1:-}" == "--restore" ]]; then
  for target in "${TARGETS[@]}"; do
    if [[ -e "$target.bak" ]]; then
      rm -rf "$target"
      mv "$target.bak" "$target"
    fi
  done
  echo "reset-install: restored"
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "usage: bun reset:install [--restore]" >&2
  exit 1
fi

for target in "${TARGETS[@]}"; do
  [[ -e "$target" ]] || continue
  if [[ -e "$target.bak" ]]; then
    rm -rf "$target"
  else
    mv "$target" "$target.bak"
  fi
done

echo "reset-install: next launch is a first launch"
for target in "${TARGETS[@]}"; do
  if [[ -e "$target.bak" ]]; then
    echo "reset-install: bun reset:install --restore brings back the previous state"
    break
  fi
done
