Status: ready-for-agent

# Resolve Volumes through an Astia passed in

Glossary (Citation scans): **Volume**, **Image**, **Link**, **Split**, **Page pin**, **Record range**.

## Why

Volume resolution (`locate.ts`) holds the decisions that pick a Volume and an Image, but it reaches Astia only through `astia.ts`'s module functions and their hidden state: the cache folder (`setCacheDir`), the request throttle, the requests in flight and the crawled Volumes kept in memory. Tests fake Astia by writing its disk-cache files (`seedParish`, keyed by a sha1 of the request path) and making `fetch` throw. Crawled Volumes stay in memory across tests, so a test can't give a parish different Volumes. As a result, Parts, overran Page pins, village narrowing and "not digitized" have no tests.

## What changes

**The Astia interface.** It covers Astia's reads plus image bytes:

```ts
interface Astia {
  archiveVolumes(archiveId: string): Promise<Volume[]>;
  volumeImages(volumeId: string, size?: ImageSize): Promise<string[]>;
  archiveTitle(archiveId: string): Promise<string | null>;
  imageBytes(volumeId: string, fileId: string): Promise<Uint8Array>;
}
```

`viewerUrl(volumeId, fileId)` stays a plain function, since it only formats a URL. `volumeYears` stays exported and tested as it is.

**The HTTP adapter.** `openAstia(cacheDir)` returns an `Astia` that owns its own cache folder, throttle, in-flight requests and crawled Volumes. Remove `setCacheDir` and the module globals from `astia.ts`. The server opens one Astia for the data folder; each script opens its own.

**The in-memory adapter.** `memoryAstia(archives)` is for tests. Each archive is given as a title plus Volumes, written as Astia labels with an Image count. A Volume's kind, years and Parts come from its label through the same parser the HTTP adapter uses, so a fixture reads like Astia. File ids are `<volume>-f<n>` for full size and `<volume>-t<n>` for thumbnails, as today. `imageBytes` returns a few fixed bytes and records the calls.

```ts
const astia = memoryAstia({
  '1212295491': {
    title: 'Juvan seurakunnan arkisto',
    volumes: [
      {
        id: 'juva-1',
        label: 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
        images: 20
      }
    ]
  }
});
```

`test-parish.ts` now gives Juva as a `memoryAstia` (for example `juvaAstia()`) and keeps its citation builders. Delete `seedParish` and its cache-file forging.

**One Scans module.** `openScans({ pins, astia })` returns:

- `resolveRef(ref)`
- `volumeLinks(volumeId, refs)`
- `matchCandidates(ref)`
- `markRef(ref, target)`

Their behaviour is unchanged. `locate.ts`'s `resolveChurchBookRef` and `parishVolumes` take the Astia as a parameter and stay internal to resolution. `createCitations(db, scans)` replaces `createCitations(db, pins)`. Citations still reads `pins.stamp()` through whatever the Scans module exposes for it, or takes `pins` alongside; pick the smaller interface.

**The image cache takes the port.** `astiaImage(astia, volumeId, n, size, signal)` and `isImageCached(astia, volumeId, image)` take the Astia. The lane, cache folder and cap stay module state as today: making the image cache an instance is a separate candidate. `useDataFolder(root)` loses its Astia line and keeps only the image cache folder and the Scan cache setting.

**The server.** `createApi(registry, { astia })` takes an optional Astia. Without one it opens `openAstia(join(registry.root, '.astia-cache'))`. Scans, Citations, the viewer-URL route and the image route all use that one instance. `viewerUrls` becomes a helper that takes the Astia, or is inlined into the route.

**Scripts.** These open an Astia for their data folder and pass it on:

- `scripts/match-citation-scans/run.ts`
- `scripts/map-citation-scans/index.ts`
- `scripts/vision/images.ts`

## Tests

**Replace, don't layer.**

- `scans.test.ts`, `citations.test.ts`, `server.test.ts` and `run.test.ts` use `memoryAstia`. Their `spyOn(fetch)` guards and `seedParish` calls go.
- `images.test.ts` and the server's image-route test use `memoryAstia` where they now fake `fetch`. The lane-order assertions read the adapter's recorded `imageBytes` calls.

**New: the HTTP adapter, in `astia.test.ts` with a fake `fetch`:**

- the crawl skips series that can't hold the books (`SKIP_SERIES`);
- Astia's XML-as-JSON becomes Volumes, with kind, years and Parts;
- answers land in the cache folder, and a second `openAstia` on the same folder reads them with no request;
- a failed request isn't cached, and the next call tries again;
- two `openAstia` instances on different folders share nothing.

**New: resolution, through `openScans` with a `memoryAstia`:**

- **Parts:** a Volume labelled with gaps (`…, 1766-1771, 1788-1789 (1766-1789)`) isn't linked for a year in a gap.
- **Overran Page pins:** two Volumes continue one page sequence, and Page pins in the first stop short of the cited page. The reference links the second Volume, not both.
- **Village narrowing:** Volumes split by villages (`kylät Hankamäki-Orala`, `kylät Pajula-Ö`) are narrowed to the one whose range holds the reference's village.
- **Archive title and not digitized:** Links carry the archive's title, and a matching Volume that isn't digitized gives `{ error: 'not digitized' }`.

Also check the real HTTP adapter by hand, against a temp copy of the data folder's `.astia-cache` (not `data/` itself): a script run resolves the same Links as before with no new requests.

## Out of scope

- The image cache and the Scan cache setting as instances (`setImageCacheDir`, `setImageCacheCap`, the lane).
- Where `PARISH_ARCHIVE` lives.
