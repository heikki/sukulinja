Status: needs-triage

> _Filed by AI from a "what's next" codebase survey._

# Surface a failed dataset list instead of a blank landing page

## Symptom

The landing page's dataset list has no error handling. If the request fails (network error, 5xx, or malformed JSON), the promise rejection is unhandled and the page stays empty: no message, no retry.

The tree view's half of this was fixed with the Dataset API: a failed load now shows the app's words where "Loading…" was.

## Why it happens

`src/client/components/app/index.ts` `loadDatasets()` awaits `fetch('/datasets')`, then `.json()`, with no try/catch. On rejection `this.datasets` never leaves `null`.

## Open question (decide before agent work)

What should a failed list render? The tree view shows "Couldn't load: <the app's words>" with no retry. The landing page could do the same, or add a Retry button.

## Fix sketch

Wrap the load in try/catch, set an `error: string | null` state on failure, and render it. The landing page isn't on the Dataset API, so it says "The app is not responding." itself when `fetch` rejects, and gives the server's text on an error status.
