Status: ready-for-agent

# Find a Volume's source by its record

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Volume**, **Citation** (`src/server/citations/GLOSSARY.md`).

`app-citations.ts` finds a Volume's source as the one an app-made Citation in that Volume with no original page cites (`volumeSource`). A converted Citation has an original page, so the next Citation made in the Volume would get a second source record.

- **Find the source by its own record**: the `@ASTIA_<volume>@` xref `newXref` gives it (or its `_<n>` variants), else a source with the Volume's label as its title and `Kansallisarkisto, Astia` as its publisher. Nothing new is stored on the source.
- No change in behaviour for today's datasets.

## Tests

- Citing two Images of one Volume makes one source.
- A Volume's source with another xref is found by its title and publisher.
- An app-made Citation with an original page in the Volume doesn't stop its source being found.

## Comments
