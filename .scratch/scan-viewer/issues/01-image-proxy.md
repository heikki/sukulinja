Status: ready-for-agent

# Astia Images through the local server, cached

Part of `../PRD.md`.

## What

- A route outside any dataset (beside `/datasets`), e.g.
  `GET /astia/volumes/<volumeId>/images/<n>` with `?size=thumb` for the
  250px one. It maps the image number to the file id through the Volume's
  cached image list (`isot` for full size, `pienet` for thumbnails), fetches
  `ws/getFile.php?fileId=…&aineistoId=…`, and answers with the JPEG and a
  long `Cache-Control` (an Image never changes).
- Image fetches get their own lane, separate from the one-request-a-second
  gate. The latest request goes first, and a queued request whose client
  has gone away (aborted) is dropped. It sends one request at a time with
  no gap between them, as Astia's own ZIP download does
  (`viewer/fileDownloader.js` fetches the selected Images back to back).
  Keep Astia's User-Agent. Someone is waiting, so an Image retries a blip
  briefly (3 attempts, 0.5 s then 1 s) and gives up rather than wait out a
  429 or a long Retry-After. The crawl keeps its patience.
- Fetched Images are written to a disk cache in the data folder beside
  `.astia-cache` (e.g. `.astia-images/`), shared by every dataset. After
  each write, the least-recently viewed Images are dropped until the cache
  is under its cap. The cap is fixed at 500 MB here; 06 makes it a setting.
  A cache hit updates its recency.
- An unknown Volume or an image number out of range is a 404. Astia being
  unreachable is a 502, so the client can offer Retry.

## Done when

- An Image seen once loads again with no Astia request, including after a
  restart.
- Asking for image 5 and then image 6 of the same Volume while image 5 is
  still queued fetches image 6 first.
- The cache stays under its cap.
