Status: ready-for-agent

# Call where a reference points a Link, and how sure it is its Certainty

Glossary: `src/server/citation-scans/CONTEXT.md` (**Link**, **Certainty**). A mechanical rename with no change in behaviour. A **scan** is the scanned Image itself, so the type that says where a reference points stops being called `Scan`.

## Renames

| Now                                                     | Becomes                                     |
| ------------------------------------------------------- | ------------------------------------------- |
| `Scan`, `scan.method`, `ScanMethod`                     | `Link`, `link.certainty`, `Certainty`       |
| `ScanResolution` = `{ scans } \| { error }`             | `LinkResolution` = `{ links } \| { error }` |
| `CitationScans`                                         | `CitationLinks`                             |
| `VolumeCitation.scan`                                   | `VolumeCitation.link`                       |
| `citations.scansOf`                                     | `citations.linksOf`                         |
| `volumeScans`, `VolumeScan` (`citation-scans/scans.ts`) | `volumeLinks`, `VolumeLink`                 |
| `pickedScan`                                            | `pickedLink`                                |
| `scanStatus`, `ScanStatus` (person panel)               | `linkStatus`, `LinkStatus`                  |
| `takeScans`, `ScanOpen`                                 | `takeLinks`, `LinkOpen`                     |
| `methodLabel`, `methodHint`                             | `certaintyLabel`, `certaintyHint`           |
| locals and fields named `scan`/`scans` holding these    | `link`/`links`                              |

`Located.method` in `locate.ts` becomes `certainty`. `EstimateBasis` and `from` keep their names.

## Unchanged

- The **Scan viewer** (`scan-viewer/`, `sl-scan-viewer`) and the **Scan cache**: both are about scanned Images.
- Image functions: `imageUrl`, `thumbUrl`, `images.ts`.
- URLs: `/api/persons/:id/scans`, `/api/citations/:id/scans`, `/api/volumes/:id/citations`.
- The event names `scan-step`, `scan-close` and `scan-marked`, which belong to the Scan viewer.
- The file `citation-scans/scans.ts` and the `citation-scans/` folder.

## Acceptance

- `grep -rnE "\bScan\b|ScanResolution|CitationScans|scansOf|VolumeScan|volumeScans|pickedScan|scanStatus|ScanStatus|takeScans|ScanOpen|ScanMethod|\.method\b" src scripts` finds nothing outside the Scan viewer's own names, its comments and the URLs. Check each remaining hit by hand.
- Comments say "link" for these and "scan" only for the scanned Image.
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass, with only names changed in the tests.
