# Places are written one way

After ADR-0023 a residence's place is MyHeritage's whole chain, "farm, village, parish, province, country", and the tree's other places come from FamilySearch's indexes and hand entry: "Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland", "Pieksamaki, Mikkeli, Finland", "Jämsä, Suomi". The same parish and country were written several ways, and the chains were long for the panel. Heikki (2026-11-13) chose to write them one way: "(farm,) village, parish, Suomi".

- **A place in Finland ends in Suomi,** for "Finland" too.
- **The province or region is left out:** a lääni ("Mikkeli (St. Michel)", "Viipuri") or a cemetery's maakunta ("Keski-Suomi", "Southern Savonia") between the parish and the country. The parish says which it was in. It's left out only with something before it, so "Mikkeli, Finland", the town, stays.
- **The parish goes by its Finnish name:** "Juva (Jockas)" is Juva.
- **The farm stays** when the chain has one (880 residences in ylonen); Heikki chose this over a strict "village, parish, country".
- `facts/place-names.ts` says so, for the import (after ADR-0023's rule) and **schema 7**, which rewrites every Fact's place and puts one Change on nothing saying how many. A place's coordinates and notes stay, as it's the same place.
- Places outside Finland are as written.

## Considered options

- **Village, parish, country only.** Rejected by Heikki: the farm would be lost.
- **Finland rather than Suomi.** Heikki chose Suomi.

## Consequences

- Schema 7; datasets migrate as they open.
- Still open: a parish spelled another way ("Pieksamaki"), the rural parishes' names ("Mikkeli Maaseurakunta"), and the villages' and farms' old spellings ("Wehmais", "Kyrckoby"). Those need a name table or a way to rename a place everywhere.
