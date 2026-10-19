Status: ready-for-agent
Blocked by: 01

# Reuse a dataset's photos on re-import, so it downloads only new ones

## Today

Every import of a MyHeritage export downloads all its photos into a new temp folder (`myheritage-*` under the OS temp dir), and deletes it once ingested. A re-import of the same tree downloads them all again, and an import that fails leaves the temp folder behind.

A photo's URL is `https://sites-cf.mhcache.com/e/1/<token>/<n>/<n>/<n>/<id>.jpg`. Comparing two exports of ylonen (Oct 15 and Oct 17): the 120-character `<token>` differs for all 221 photos; the rest, the **stable tail** `<n>/<n>/<n>/<id>.jpg`, is the same in both, and unique to each photo.

## Steps

1. **A photo's name** (`photoNameOf` in `myheritage.ts`, replacing `assignNames`):
   - an `mhcache.com` URL of that shape is named by its stable tail
   - any other URL, or a tail with a segment outside `[A-Za-z0-9._-]`, by a hash of the whole URL plus its extension

   The `FILE` is rewritten to the name, so a media row's original path is the stable tail.

2. **No separate cache: the dataset's own media.** Before converting, `importDataset` reads the media rows of the dataset now under the slug: a photo whose name is a row's original path is copied from that dataset's `media/` instead of downloaded. A photo no longer in the export isn't copied, so it goes with the old dataset, and deleting a dataset leaves nothing behind.
3. **Gathering:** the photos are gathered by name into a temp folder (`myheritage-photos-*`), removed whether the import succeeds or fails. A download writes `<name>.part` and renames it into place, so a stalled or failed one never leaves a file under the photo's name. URLs naming the same photo are fetched once.
4. **`runPool`** starts no item after one fails, and throws only once the items under way have settled, so cleanup never races a worker still writing.
5. **Counts:** `MyHeritageSummary` and the log tell downloaded photos from ones kept from before ("Downloading 3 photos, 122 kept from before").
6. Correct the header of `myheritage.ts`: the token in each URL changes with every export; the rest stays.

## Acceptance

- **`import-dataset.test.ts`**, through `importDataset` with a fake downloader:
  - a second import of the same tree, with new tokens in every URL, downloads nothing and gives the same media rows
  - a media row's original path is the stable tail
  - a photo left out of the next export is gone from the dataset after it
  - a download that throws fails the import and leaves no dataset, staging dir or photo temp folder
- **`myheritage.test.ts`:** names; a failed download leaves no file under the photo's name; URLs naming one photo share a fetch; a stored photo is copied, not fetched.
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
- **On two exports of ylonen** (Oct 15 and Oct 17), imported as a throwaway dataset `scratch` (never over `ylonen`): the first downloads the photos; the second then downloads none and shows the same photos. Delete `scratch` afterwards.
