#!/bin/sh
# Claude Code's SessionStart hook: a cloud session starts from a fresh clone
# with nothing installed. Installs the dependencies, then runs the
# postinstall (pre-push hook and Electrobun's SDK) with Hutch's downloads
# going through hutch-proxy.ts, which they need there.
[ "$CLAUDE_CODE_REMOTE" = true ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] || bun install --frozen-lockfile --ignore-scripts >&2 || exit 0
[ -d .hutch/devkit ] && exit 0
bun scripts/hutch-proxy.ts 18080 &
proxy=$!
sleep 1
HTTPS_PROXY=http://127.0.0.1:18080 HTTP_PROXY=http://127.0.0.1:18080 \
  https_proxy=http://127.0.0.1:18080 http_proxy=http://127.0.0.1:18080 \
  bun run postinstall >&2 || true
kill $proxy
exit 0
