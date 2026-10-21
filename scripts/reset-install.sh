#!/usr/bin/env bash
#
# Put the installed app back in its first-launch state, to test the demo seed.
#
# By default, deletes what makes a launch a first one: the datasets, the
# marker that the demo was offered (src/server/demo.ts), state.json (the
# window's frame) and the webview's storage (the appearance cookie). It keeps
# what's hard or slow to get back: the pins (vision matches and hand marks),
# settings, and Astia's answers and Images.
#
# --all deletes the app's folder and the webview's storage outright, pins and
# caches included, after asking.
#
# Electrobun's own com.sukulinja.app folder is left alone: it holds the
# self-extractor's bookkeeping, not app state.
#
# Usage: bun reset:install [--all]
set -euo pipefail
shopt -s nullglob

SUPPORT="$HOME/Library/Application Support/Sukulinja"
DATA="$SUPPORT/data"
WEBKIT="$HOME/Library/WebKit/com.sukulinja.app"

if pgrep -f "/Sukulinja.app/Contents/MacOS/" >/dev/null; then
  echo "reset-install: Sukulinja is running — quit it first" >&2
  exit 1
fi

case "${1:-}" in
  "") ;;
  --all)
    read -r -p "Delete $SUPPORT, pins and caches included? Type yes: " answer
    if [[ "$answer" != yes ]]; then
      echo "reset-install: nothing deleted"
      exit 1
    fi
    rm -rf "$SUPPORT" "$WEBKIT"
    echo "reset-install: deleted everything; next launch is a first launch"
    exit 0
    ;;
  *)
    echo "usage: bun reset:install [--all]" >&2
    exit 1
    ;;
esac

# A dataset is a folder named as a slug holding its database; an import
# killed midway leaves a .staging- folder.
for dir in "$DATA"/*/ "$DATA"/.staging-*/; do
  name=$(basename "$dir")
  if [[ "$name" == .staging-* ]] ||
    [[ "$name" =~ ^[a-z0-9][a-z0-9_-]*$ && -f "$dir/db.sqlite" ]]; then
    rm -rf "$dir"
    echo "reset-install: deleted dataset $name"
  fi
done
rm -f "$DATA/.demo-offered" "$SUPPORT/state.json"
rm -rf "$WEBKIT"

echo "reset-install: kept pins, settings and caches; next launch is a first launch"
