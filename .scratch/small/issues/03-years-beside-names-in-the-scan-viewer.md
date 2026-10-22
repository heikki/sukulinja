Status: needs-triage

# Show a person's years beside their name in the Scan viewer

Glossary: **Scan viewer**, **Selected person** (`src/client/components/tree-view/CONTEXT.md`).

Names repeat across a family (two Juhos, a Maria in each generation), so a name alone often doesn't say who's meant. Show the years beside the name, as the chart's cards and the person search do (`formatDates` in `src/client/components/tree-view/renderer.ts`: "1890 – 1943").

Two places lack them:

- **The people beside the scan** (`scan-viewer/people.ts`, named by `rowName` in `scan-viewer/citations.ts`).
- **The _Cite this entry for_ menu's family list** (`citeChoices` in `scan-viewer/cite.ts`), labelled "relation · name". Its _Someone else…_ search (`sl-person-search`) already shows years.

## Open questions

- **Placement.** After the name in a muted style, as the person search does, or on a second line.
- **Someone not in the tree.** A row named from the MyHeritage record has no person and no years; it stays as it is.

## Comments
