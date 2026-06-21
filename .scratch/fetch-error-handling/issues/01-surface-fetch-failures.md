Status: needs-triage

> _Filed by AI from a "what's next" codebase survey._

# Surface fetch failures instead of hanging on a blank/Loading screen

## Symptom

Two client data-loads have no error handling. If the request fails (network
error, 5xx, or malformed JSON), the promise rejection is unhandled and the
component is stuck in its initial state forever — no message, no retry.

- **Dataset chooser** (`AppElement`): `datasets` stays `null`, so the landing
  page renders empty.
- **Tree view** (`TreeViewElement`): `loading` stays `true`, so the chart is
  stuck on "Loading…".

## Why it happens

- `src/client/components/app/index.ts:112` — `loadDatasets()` awaits
  `fetch('/datasets')` then `.json()` with no try/catch; on rejection
  `this.datasets` never leaves `null`.
- `src/client/components/tree-view/index.ts:163` — `load()` awaits
  `Promise.all([…/api/persons, …/api/families])` then `.json()` with no
  try/catch; on rejection `this.loading` never flips to `false` and
  `restoreFromHash()` never runs.

## Open question (decide before agent work)

What should a failed load render? Inline error text; an error + Retry button;
distinguish network vs. 5xx vs. empty-DB? Pick the UX, then both sites follow the
same pattern (likely an `error: string | null` @state alongside the existing
`loading` / `datasets` flags).

## Fix sketch

Wrap each load in try/catch, set the `error` state on failure (and clear the
loading flag), render it. Keep the two components consistent. No retry logic for
v1 unless the decision above calls for it.
