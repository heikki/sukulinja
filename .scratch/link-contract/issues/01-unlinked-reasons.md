Status: ready-for-agent

# Say why a reference has no Link, in types, and share the Link labels

Glossary (Citation scans): **Link**, **Precision**, **Certainty**, **Split**, **Volume**, **Image**. New: **Unlinked**.

## Why

When a Church-book reference has no Link, the server says why with a free-form string. Volume resolution sends `unparsed`, `no archive for <parish>`, `no matching volume`, `not digitized` and `no images`; `openScans` adds `Astia unavailable`. The client works the meaning back out of the wording:

- The person panel keeps a `FINDABLE` set of three exact strings, used to pick "Not found" or "No scan".
- When Astia is down, the panel says "No scan", as though the book had none.
- The matcher compares against the exact text `'no matching volume'`.
- A panel test feeds `'no archive'`, which the server never sends.

`openScans.resolveRef` catches anything thrown, so a bug in our code shows as an Astia failure. The three server routes that answer 502 do the same.

The person panel imports `linkLabel`, `linkHint`, `splitLabel` and `volumeTitle` from the Scan viewer's `citations.ts`, so the panel's words live inside another component.

## What changes

**The reasons.** They become a type in `src/common/types.ts`, sent under their own key. They aren't errors: "not digitized" is a fact about the book.

```ts
export type Unlinked =
  | 'unparsed' // the reference can't be read as parish, book and years
  | 'no-archive' // the parish's Astia archive isn't known
  | 'no-volume' // no Volume fits the years
  | 'not-digitized'
  | 'no-images'
  | 'astia-error'; // a request to Astia failed; passes

export type LinkResolution = { links: Link[] } | { unlinked: Unlinked };
```

`resolveLinks` in `locate.ts` returns these. `no-archive` drops the parish name, because the citation already shows it.

**What counts as an Astia error.** `astia.ts` exports `class AstiaError extends Error`. The HTTP adapter throws it on every failed request: `fetch` rejecting, any non-OK status (404 included) and an empty Image body. The message keeps the status and the path. `memoryAstia` still throws a plain `Error` for an unknown archive or Volume, since that's a mistake in a test's setup.

Only `AstiaError` is caught as an Astia failure. Anything else is rethrown in these places:

- `openScans.resolveRef` turns it into `{ unlinked: 'astia-error' }`. A bug now ends the person's stream instead, and the panel shows the rest as "Scan unavailable".
- `handleVolumeCitations`, `handleViewerUrls` and `handleAstiaImage` answer 502 only for it, and so does `handleMark` (saving a Mark reads Astia too). The 502 body is the tooltip's first sentence, since the Scan viewer shows a refused Mark's text; other errors are thrown on, and Bun answers 500. An aborted Image request still just ends.

**The in-memory Astia can be down.** `memoryAstia(archives, { down: true })`: every call throws `AstiaError`, and each call is still recorded in `asked`.

**Shared Link labels.** These move into `src/client/link-labels.ts`, which the panel and the Scan viewer both import:

- the Certainty names (`groupCitations` uses them);
- `linkLabel`, `linkHint`, `splitLabel` and `SPLIT_NOTE`;
- `volumeTitle`;
- `unlinkedLabel(reason)` and `unlinkedHint(reason)`, built from a `Record<Unlinked, …>` so the compiler requires every reason.

`scan-viewer/citations.ts` keeps grouping, Boxes and entries. The panel's `linkStatus` and `groupSources` stay in the panel and build on the shared module. `FINDABLE` is deleted.

**What the panel shows.** There are three chips, and each reason has its own tooltip:

| Chip        | Reason          | Tooltip                                                                      |
| ----------- | --------------- | ---------------------------------------------------------------------------- |
| No scan     | `unparsed`      | The reference couldn't be read as parish, book and years.                    |
| No scan     | `no-archive`    | The app doesn't know which Astia archive holds this parish.                  |
| Not found   | `no-volume`     | The parish's books were found, but none for these years.                     |
| Not found   | `not-digitized` | Its Volume isn't digitized in Astia.                                         |
| Not found   | `no-images`     | Astia lists the Volume but has no Images for it.                             |
| Astia error | `astia-error`   | Astia couldn't be reached or gave no answer. Open the person again to retry. |

"Finding scan…" (pending) and "Scan unavailable" (the stream ended without this one) stay as they are.

**Scripts.**

- `match-citation-scans/run.ts` compares against `'no-volume'`.
- The tallies in `map-citation-scans` and the matcher print the code, for example `rippi ✗ no-volume`.

**Glossary.** Add to `src/server/citation-scans/CONTEXT.md`, after **Link** and in the same commit:

> **Unlinked**:
> A Church-book reference with no Link, and why: it can't be read, its parish's archive isn't known, no Volume fits its years, or its Volume isn't digitized or has no Images; or a request to Astia failed, which passes.
> _Avoid_: error (most are facts about the books).

## Tests

**Replace, don't layer.**

- The panel tests in `helpers.test.ts` use the typed reasons. The `'no archive'` case becomes `'no-archive'`.
- The `linkLabel`, `linkHint`, `splitLabel` and `volumeTitle` tests move from `scan-viewer/citations.test.ts` and `person-panel/helpers.test.ts` to `link-labels.test.ts`.
- The `not digitized` assertion in `scans.test.ts` becomes `{ unlinked: 'not-digitized' }`.

**New:**

- `scans.test.ts`, through `openScans`: each of the six reasons from a fitting reference or Astia. That's `astia-error` from `memoryAstia(…, { down: true })`, plus a non-Astia error thrown by an Astia, which `resolveRef` lets through.
- `astia.test.ts`: a 404, a 503 after retries, and a rejecting `fetch` each throw `AstiaError`.
- `helpers.test.ts`: each reason's chip and tooltip.
- `server.test.ts`: a down Astia gives 502 on the Volume's citations route; with an Astia throwing a plain `Error`, the route throws.
