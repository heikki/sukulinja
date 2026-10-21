#!/usr/bin/env bash
#
# Put the installed app back in its first-launch state, to test the demo seed.
#
# An installed app seeds the bundled demo only when its data folder doesn't
# exist (src/server/demo.ts), so a first launch is reproduced by taking that
# folder away, along with state.json beside it and the webview's storage (the
# appearance cookie). Electrobun's own com.sukulinja.app folder is left alone:
# it holds the self-extractor's bookkeeping, not app state.
#
# A reset moves the real state to a .bak beside each location, and refuses
# while a .bak is there: the state it would take away may be real, and this
# script never deletes anything. --restore puts the backup back and moves the
# test state aside, to a .discarded-<time> folder, for you to delete.
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
  stamp=$(date +%Y%m%d-%H%M%S)
  for target in "${TARGETS[@]}"; do
    [[ -e "$target.bak" ]] || continue
    if [[ -e "$target" ]]; then
      mv "$target" "$target.discarded-$stamp"
      echo "reset-install: test state moved to $target.discarded-$stamp"
    fi
    mv "$target.bak" "$target"
  done
  echo "reset-install: restored"
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "usage: bun reset:install [--restore]" >&2
  exit 1
fi

for target in "${TARGETS[@]}"; do
  if [[ -e "$target.bak" ]]; then
    echo "reset-install: $target.bak exists — run with --restore first, or move it away if it's stale" >&2
    exit 1
  fi
done

for target in "${TARGETS[@]}"; do
  [[ -e "$target" ]] && mv "$target" "$target.bak"
done

echo "reset-install: next launch is a first launch"
echo "reset-install: bun reset:install --restore brings back the previous state"
