Status: ready-for-agent

# Read a dataset's media references once, for both copying and linking

## The bug

Two walks over the GEDCOM decide which photos a dataset has, and they disagree:

- `media-ingest.ts` (`collectFileRefs`) copies **every** `FILE` of every `OBJE` directly under an `INDI` **or a `FAM`**.
- `gedcom-import.ts` (`importMediaLink`) links only the **first** `FILE` of each `OBJE` directly under an **`INDI`**.

So a family's photos, and an `OBJE`'s second `FILE`, are copied into `media/` and never linked. A TODO in `gedcom-import.ts` claims the two walks mirror each other. Neither of today's datasets shows it (ylonen: 125 files, 125 rows; bourbon: 47, 47), but any GEDCOM with a family photo does.

## Steps

1. **One rule.** A function, `mediaRefsOf(record)`, in a new `src/server/media-refs.ts`, gives the media references of one `INDI` or `FAM`: for each `OBJE` directly under it, in order, one reference per `FILE`, with
   - the `FILE` value (the path to copy and the original path to keep)
   - its `FORM`, its `CROP`, and the `OBJE`'s `_PRIM` and `TITL`
   - its order among the record's references

   `OBJE` nested in events and top-level `OBJE` records referenced by pointer stay out, as now; the rule names them as not yet read.

2. **Copying** (`media-ingest.ts`): copies the paths of `mediaRefsOf` over every `INDI` and `FAM`, in place of `collectFileRefs`.
3. **Linking** (`gedcom-import.ts`): `importPersonDetails` and `importFamilyDetails` write one media row and one link per reference from `mediaRefsOf`, with scope `person` or `family`. The TODO goes.
4. **Tests through the pipeline:** `ImportRequest` gains `download?: Downloader`, passed to `convertMyHeritage`.

## Acceptance

- **`import-dataset.test.ts`** (new), through `importDataset` on a temp registry with a fake downloader:
  - a MyHeritage photo (remote `FILE`, sibling `FORM`, `_POSITION`) lands as a media row with a MIME format and a face crop (moved from `myheritage-import.test.ts`, which goes)
  - a family's photo is copied and linked with scope `family`
  - an `OBJE` with two `FILE`s gives two linked media rows, in order
  - every file in the dataset's `media/` has a media row, and every media row a file
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
