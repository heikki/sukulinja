# CLAUDE.md

## Agent skills

### Issue tracker

Issues for this repo live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `GLOSSARY-MAP.md` at the repo root points at each context's `GLOSSARY.md`; ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## UI changes

Check a UI change with `bun run e2e` (ADR-0034), in the cloud too: `SUKULINJA_E2E_SHOTS=/mnt/project-files/<feature> bun run e2e` saves the screenshots its tests take. A new path a person takes through the app gets a test in `e2e/`. How to run and write them: `e2e/README.md`.

## Commit messages

Short, plain, imperative subject, like "Ask before clearing the scan cache". Body only if the why isn't obvious, in 1–2 sentences.
