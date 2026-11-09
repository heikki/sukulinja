Status: ready-for-agent
Blocked by: 01

# Find the dataset's parish archives in a module of their own

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Volume**, **Citation**, **Link** (`src/server/citations/GLOSSARY.md`).

`parishes()` in `citations.ts` takes the dataset's parishes from its references only. They name a Link's archive and check that a Volume being cited is in the tree's church books (`images.archiveTitleOf`, `images.imageToCite`). Once references are converted, they'd run out.

- **A module beside `images.ts`** giving the dataset's parish archives: the archives of the parishes the References port gives, then those holding a Volume the dataset's Citations of Images cite, found among the known parish archives in `astia/archives.ts` (each crawled once and cached).
- **`images.archiveTitleOf` and `imageToCite`** take archives, not parish names; `archiveOf`'s most-cited-first order is kept.
- Not the tree's places: their names don't map to archives reliably.

## Tests

- A dataset whose only church-book Citations are Citations of Images can cite another Image in a Volume of the same parish, and its Links name their archive.
- A Volume in no known parish archive is still refused.

## Comments
