# CLAUDE.md

## Agent skills

### Issue tracker

Issues for this repo live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `GLOSSARY-MAP.md` at the repo root points at each context's `GLOSSARY.md`; ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Commit messages

Short, plain, imperative subject, like "Ask before clearing the scan cache". Body only if the why isn't obvious, in 1–2 sentences.

## Review

Before reporting a feature or fix done, run `/code-review` since the commit before the work's first one, and fix or raise what it finds. Its judgement rules are in `CODING_STANDARDS.md`.
