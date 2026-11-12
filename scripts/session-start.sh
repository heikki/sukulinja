#!/bin/sh
# Claude Code's SessionStart hook: a cloud session starts from a fresh clone
# with nothing installed, so install, which also turns on the pre-push hook.
# Electrobun's postinstall can't download there, so its failure is ignored.
[ "$CLAUDE_CODE_REMOTE" = true ] || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -d node_modules ] || bun install --frozen-lockfile >&2 || true
exit 0
