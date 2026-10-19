Status: ready-for-agent

# Give the client one typed Dataset API

Glossary (Citation scans): **Link**, **Unlinked**, **Mark**, **Volume**, **Image**, **Scan viewer**. No new terms: "Dataset API" is an architecture name, not a domain one.

## Why

A dataset's screens each build route strings, call `fetch` and cast the JSON:

- `tree-view/index.ts` `load()`: `/api/persons` and `/api/families`, cast to `PersonRow[]` and `FamilyRow[]`. There's no error handling: a failed load leaves "Loading…" up forever.
- `person-panel/index.ts`: `load()` (`/api/persons/:id`, cast to `PersonDetails`) and `loadLinks()` (`/api/persons/:id/scans` through `readNdjson`, each line cast to `CitationLinks`).
- The Scan viewer:
  - `Latest.get<T>(url)` for the Astia viewer URLs and `/api/volumes/:id/citations`;
  - `saveMark` in `helpers.ts`;
  - `imageUrl` and `thumbUrl` building `/astia/…` strings.
- `renderer.ts` and `avatar-cache.ts`: `mediaUrl`.

`src/client/api.ts` only prefixes paths with the dataset's `/d/<slug>`. It parses the slug from `window.location` with a copy of `DATASET_RE`; `app/index.ts` has a second copy. Route strings are kept in step with `server.ts` by hand. None of this can run in a test without a server, which is what app state (#04, #10, #11) is going to need.

## What changes

**One module, built per dataset.** `src/client/dataset-api/index.ts` exports the `DatasetApi` interface, `ApiError` and `openDatasetApi(slug, { fetch? })`, the fetch adapter. `fetch` defaults to the global one; the contract test passes the server's.

```ts
const api = openDatasetApi(slug);

api.persons(signal?);                 // PersonRow[]
api.families(signal?);                // FamilyRow[]
api.person(id, signal?);              // PersonDetails
api.personLinks(id, signal?);         // AsyncIterable<CitationLinks>, as each line arrives
api.mark(citationId, { volumeId, image }); // CitationLinks: the reference resolved again
api.volumeCitations(volumeId, signal?);    // VolumeCitation[]
api.volumeImages(volumeId, signal?);       // string[]: Astia's viewer URLs, in order

api.imageUrl(volumeId, n, retry);     // for <img src> and Prefetch
api.thumbUrl(volumeId, n);
api.mediaUrl(storedPath);
```

Every route string lives in the fetch adapter. That includes the shared `/astia/volumes/…` routes the Scan viewer uses; they aren't per dataset, but only a dataset's screens ask for them.

**Errors.**

- A request answered with an error status throws `ApiError` carrying the server's words (its body text), or `"<what> failed (<status>)"` when the body is empty.
- A request that can't reach the app throws `ApiError("The app is not responding.")`.
- An aborted call rejects with the signal's reason. A caller tells "failed" from "superseded" by checking its own signal.
- Anything else thrown is a bug, and is thrown on.

**Streaming.** `personLinks` is an async generator over `readNdjson`'s lines, so a caller writes `for await (const links of api.personLinks(id, signal))`. Aborting ends it with the signal's reason. `readNdjson` stays in `src/client/ndjson.ts`, since the landing page's import stream uses it too.

**The memory adapter.** `src/client/dataset-api/memory.ts` exports `memoryDatasetApi(data)` for tests of app state. It takes the dataset as plain values (`persons`, `families`, `details` by id, `links` by person, `volumes` with their citations and Image count) and records what was asked in `asked`, like `memoryAstia`. Marks:

- `mark` records the call and answers with the `CitationLinks` given for that citation;
- it throws `ApiError` when none was given, or when the adapter is opened `{ down: true }`.

URL methods return made-up strings tests can match, such as `memory:image/<volume>/<n>`.

**Wiring until #04.**

- The app parses the slug once (its `currentSlug()`, the client's only `DATASET_RE`).
- When there's a slug, it opens `openDatasetApi(slug)` and passes `.api` to `<sl-tree-view>`.
- Tree-view passes it on to `<sl-person-panel>` and `<sl-scan-viewer>`, and the Scan viewer to its people list (for `mark`).
- `renderer.ts` and the avatar cache get the API's `mediaUrl` from tree-view instead of importing it.

#04 later replaces these properties with app state provided through `@lit/context`.

**Callers.**

- Tree-view's `load()`, the panel's `load()` and `loadLinks()`, the Scan viewer's two loads, and the people list's Mark call the API.
- `Latest` stays as the Scan viewer's "one at a time, the last ask wins". It takes a call instead of a URL: `latest.run((signal) => api.volumeCitations(id, signal))`. It keeps answering null on failure and undefined when superseded, so the viewer's states don't change.
- `saveMark` goes. The people list catches `ApiError` and shows its words as it shows `saved.error` now.
- `imageUrl` and `thumbUrl` leave `helpers.ts`. The Scan viewer and `Prefetch` take URLs from the API, and `Prefetch` still fetches them itself to fill the webview's cache.

**Deleted.** `src/client/api.ts`: `datasetPrefix`, `apiUrl` and `mediaUrl`.

**Tree-view's failed load.** This is the tree-view half of `.scratch/fetch-error-handling/issues/01`.

- A failed load shows its `ApiError` words where "Loading…" is, like the panel's "Couldn't load: …". There's no retry.
- An error that isn't an `ApiError` is thrown on.
- The fetch-error issue is narrowed to the landing page's dataset list in the same commit.

**Out of scope.** The landing page (`/datasets`, `/import`, delete) and Settings' `/settings/scan-cache` keep their own fetches.

## Tests

**New: `src/client/dataset-api/contract.test.ts`.**

- It runs `openDatasetApi(slug, { fetch })` against the real server in-process: `createStaticFetch` over a `createApi` with a temp `DatasetRegistry` and `juvaAstia()`, and a small GEDCOM imported as in `server.test.ts`. No family data: use the test parish's made-up people.
- One test per method checks the answer's shape against what the server returns:
  - `persons`, `families` and `person`;
  - `personLinks` yields one `CitationLinks` per citation;
  - `mark` returns the reference resolved again;
  - `volumeCitations`;
  - `volumeImages` gives as many URLs as the Volume has Images;
  - `imageUrl` and `mediaUrl` fetch with a 200 through the same server.
- Failures:
  - an unknown person throws `ApiError` with the server's words;
  - a `memoryAstia(…, { down: true })` makes `volumeImages` throw `ApiError` with the 502's words;
  - a `fetch` that rejects gives "The app is not responding.";
  - an aborted `personLinks` rejects with the signal's reason.

**New: `src/client/dataset-api/memory.test.ts`.** The memory adapter answers what it was given, records `asked`, and throws `ApiError` when down or for a Mark it has no answer for.

**Kept.** The Scan viewer's `helpers.test.ts` loses its `imageUrl` test: the URL's form, including `?retry=`, is checked in the contract test. `prefetch.test.ts` is unchanged, as it already takes a loader.

Check each new test fails under a mutation of the decision it covers: a route string, the error words, and abort versus failure.
