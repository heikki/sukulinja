Status: resolved

# Fetch a re-scanned Volume's list again when Astia answers with the placeholder

Parent: `01-detect-a-rescan.md`. Glossary: **Volume**, **Image**, **Scan cache**, **Scan viewer**.

The Scan cache turns a Volume's Image number into a file id from the cached list, then asks `getFile.php` for it. After a re-scan, every id in the cached list is gone and Astia answers each with its placeholder PNG, so the viewer shows nothing for good.

## Do

- `imageBytes` throws its own error (a subclass of `AstiaError`) when Astia keeps answering with something that isn't a JPEG, so callers can tell "no such file" from Astia being down. Fix the comment on `isJpeg`: the placeholder is also what Astia gives for an id it no longer has.
- `Astia` gets a way to fetch a Volume's list again, bypassing `.astia-cache`, and replace the cached answer with it. A refresh already running for that Volume is shared, like `inflight`; a failed one leaves the cached list alone.
- The Scan cache, given that error for an Image: fetches the list again, and if the id at that Image number has changed, fetches the Image once more with the new id. If it hasn't changed, or the second try also fails, it throws as before. Both the viewer and the vision pass (`scripts/vision/images.ts`) go through `image()`, so both recover.
- The Image response (`handleAstiaImage` in `server.ts`) is marked immutable and kept by the webview under `/astia/volumes/<id>/images/<n>`, but after a re-scan the same number is a different photograph. Let the client's URL name the file (e.g. `?file=<fileId>`, taken from the list it already loads), or drop `immutable` in favour of an `ETag` of the file id. Pick the smaller change.
- `memoryAstia` can stand in for a re-scan in tests: a Volume whose list changes, and whose old ids no longer give an Image.

## Tests

- An Image whose file id was replaced: the list is fetched again, the cached list file now holds the new ids, and the Image comes back from the new id.
- An Image that fails with the list unchanged throws as before, after one fetch of the list, not one per retry.
- Two Images of the same Volume failing at once fetch the list once.
- Astia down during the refresh: the old cached list stays.

## Not here

Pins made on the old filming (`03`), and spotting re-scans before anyone opens the Volume (`04`).

## Answer

- `imageBytes` throws `NoImageError` (an `AstiaError`) for an id Astia has no file for; `refreshImages` fetches a Volume's list past the cache, shares a refresh already running, and keeps the old list when it fails.
- The Scan cache's `image()` refreshes once on `NoImageError` and fetches the Image by its new id; an Image past the new filming is `null` (404), an unchanged id throws as before. A second Image of the same Volume finds the list already renewed and doesn't ask again.
- The Image route answers with `ETag: "<fileId>"` and `Cache-Control: no-cache`, and 304 when it matches, instead of `immutable`. Server-only; the client is unchanged.
- Checked against Astia on 2026-10-21 with the old 455-id list of I Ab:9: Image 120 came back as `15047072402`, and the cached list on disk is the 434-id one.
