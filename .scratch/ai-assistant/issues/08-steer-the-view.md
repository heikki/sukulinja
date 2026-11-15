# The assistant changes the Generation limit

Status: needs-triage

Selecting a person and opening a source are done (ADR-0028, show operations). Left for later, as Heikki chose on 2026-11-15:

## What

A show operation `set_generations` (1–5) that changes how many generations the chart shows, as Settings does.

## Needs first

The Generation limit lives in the tree view component (`gen`, read from the `sl-generations` cookie, written back by Settings' `generations-change`), not in app state, so nothing outside the component can change it. Move it into a signal (as `client/assistant-choices.ts` keeps the model), read by the chart and Settings; then the show operation's step can set it like any other.
