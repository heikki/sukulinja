Status: ready-for-agent
Blocked by: 01

# Keep MyHeritage photos between imports, so a re-import downloads only new ones

## Today

Every import of a MyHeritage export downloads all its photos into a new temp folder (`myheritage-*` under the OS temp dir), and deletes it once ingested. A re-import of the same tree downloads them all again, and an import that fails leaves the temp folder behind.

A photo's URL is `https://sites-cf.mhcache.com/e/1/<token>/<n>/<n>/<n>/<id>.jpg`. Comparing two exports of ylonen (Oct 15 and Oct 17): the 120-character `<token>` differs for all 221 photos; the rest, the **stable tail** `<n>/<n>/<n>/<id>.jpg`, is the same in both, and unique to each photo.

## Steps

1. **The photo cache** is `<data folder>/.myheritage-photos/`, shared by every dataset (the dot keeps it out of the dataset list) and never trimmed. `importDataset` passes `join(registry.root, '.myheritage-photos')` to `convertMyHeritage` as its `stagingDir`, in place of the temp folder, which goes.
2. **Names** (`myheritage.ts`, replacing `assignNames`):
   - an `mhcache.com` URL of that shape is kept at its stable tail: `.myheritage-photos/<n>/<n>/<n>/<id>.jpg`
   - any other URL, or a tail with a segment outside `[A-Za-z0-9._-]`, at a hash of the whole URL plus its extension
3. **Downloading:** a photo already in the cache isn't downloaded. A download writes `<name>.part` and renames it into place, so a stalled or failed one never leaves a file a later import would take as cached.
4. **The GEDCOM's `FILE`** is rewritten to the cache name, so a media row's original path is the stable tail.
5. **Counts:** `MyHeritageSummary` and the log tell downloaded photos from cached ones ("Downloaded 3 photos, 218 from the cache").
6. Correct the header of `myheritage.ts`: the token in each URL changes with every export; the rest stays.

## Acceptance

- **`import-dataset.test.ts`**, through `importDataset` with a fake downloader:
  - a second import of the same tree, with new tokens in every URL, downloads nothing and gives the same media rows
  - a media row's original path is the stable tail
  - a download that fails leaves no file under its name; one that throws fails the import and leaves nothing behind in the temp dir or the data folder but the cache
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
- **On two exports of ylonen** (Oct 15 and Oct 17), imported as a throwaway dataset `scratch` (never over `ylonen`): the first downloads the photos; the second then downloads none and shows the same photos. Delete `scratch` afterwards.
