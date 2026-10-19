Status: ready-for-agent

# Make the Scan cache one object per data folder

Glossary (Citation scans): **Image**, **Volume**, **Scan viewer**. New: **Scan cache**.

## Why

The Images kept for the Scan viewer and the vision pass live in `images.ts` as module globals: the folder, the cap and the full-size queue (`queued`, `jobs`, `busy`). They are set from outside:

- `useDataFolder(root)` in `scans.ts` sets the folder and starts `scan-cache.ts` reading the saved cap. Since the Astia port, that's all it does. `createApi`, `runMatching` and evaluate-reader call it.
- `scan-cache.ts` reads and writes `settings.local.json`, then calls `setImageCacheCap`.
- Tests reset the folder and cap before each test. The server's Scan cache test sets the cap back to 2 GB at the end, so later tests aren't affected.

The saved cap is read asynchronously. Only the settings route waits for it, so a fetch before then prunes against the 2 GB default. With 5 or 10 GB saved, that drops cached Images down to 2 GB.

## What changes

**One object.** `scan-cache.ts` exports `openScanCache({ astia, root })` and `type ScanCache`. It owns:

- the folder, `<root>/.astia-images`;
- the cap, and saving it to `<root>/settings.local.json` as `scanCacheBytes`, keeping the file's other keys;
- pruning the least recently viewed Images;
- the full-size queue (one at a time, latest first, a request dropped when no one waits for it any more). The queue belongs to the instance.

```ts
const cache = openScanCache({ astia, root });
cache.image(at, size, signal); // the cached file's path, or null: no such Image
cache.isCached(at);
cache.status(); // ScanCacheStatus: { cap, used, caps }
cache.setCap(cap); // saves it, and shrinks to it at once
cache.clear();
```

`images.ts` merges into `scan-cache.ts` and is deleted, along with `setImageCacheDir`, `setImageCacheCap`, `imageCacheCap`, `imageCacheUsed`, `shrinkImageCache`, `clearImageCache`, `isImageCached`, `astiaImage` and `useScanCacheSettings`. The queue and pruning code stay as they are; only who holds the state changes.

**The saved cap is read before the first prune.** `openScanCache` returns at once and starts reading the cap. `status`, `setCap` and every prune wait for that read, so nothing prunes with the default while a saved cap is loading.

**The caps.** The choices become 2, 5, 10 and 20 GB (1 GB goes, 20 GB comes in). The default stays 2 GB. A saved cap not among them, such as an old 1 GB, falls back to the default, as an unknown cap does now. Settings already draws its buttons from the server's `caps`.

**The route.** `routeScanCache(cache, req)` stays in `scan-cache.ts` as a thin mapping: GET → `status()`, PUT `{ cap }` → `setCap`, checked against the caps, DELETE → `clear()`.

**The server.** `createApi` opens one `openScanCache({ astia, root: registry.root })` over its Astia. It hands it to the Image route and the settings route through `routeShared`. There's no new `ApiOptions` field: tests use a temp root each, so each test gets its own cache.

**`useDataFolder` is deleted.**

- `runMatching` and evaluate-reader stop calling it; nothing else in them uses the cache.
- `match-citation-scans/index.ts` and evaluate-reader open `openScanCache({ astia, root })` and pass it to `pacedImages(cache)`. That uses `cache.isCached(at)` and `cache.image(at, 'full', signal)`.

**Glossary.** Add to `src/server/citation-scans/CONTEXT.md`, in the same commit:

> **Scan cache**:
> The Images kept on disk for the Scan viewer and the vision pass, up to a size the install sets; the least recently viewed go first.
> _Avoid_: image cache, Astia cache (that's Astia's answers about archives and Volumes).

## Tests

**Replace, don't layer.**

- `images.test.ts` becomes `scan-cache.test.ts`. Each test opens its own `openScanCache` on a temp root over `memoryAstia` with the `imageBytes` override it has today. `setImageCacheDir` and `setImageCacheCap` are no longer called before each test; tests that need a tiny cap call `cache.setCap`.
- The server's Scan cache test loses its trailing "set it back to 2 GB" line, and checks the caps are 2 / 5 / 10 / 20 GB.
- `run.test.ts` and the vision-pass tests stop relying on `useDataFolder`.

**New:**

- A cache opened on a root whose `settings.local.json` holds 10 GB reports 10 GB right away. A saved cap not among the choices, such as 1 GB, reports the 2 GB default.
- `setCap` keeps the settings file's other keys.
- Two caches on different roots share neither files nor a queue: a full-size Image held in one doesn't hold up the other.
