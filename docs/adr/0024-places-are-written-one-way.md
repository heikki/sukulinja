# Places are written one way

After ADR-0023 a residence's place is MyHeritage's whole chain, "farm, village, parish, province, country", and the tree's other places come from FamilySearch's indexes and hand entry: "Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland", "Pieksamaki, Mikkeli, Finland", "Jämsä, Suomi". The same parish and country were written several ways, and the chains were long for the panel. Heikki (2026-11-13) chose to write them one way: "(farm,) village, parish, Suomi", e.g. "Laukola, Haukivuori, Suomi".

- **A place in Finland ends in Suomi,** for "Finland" too.
- **The province or region is left out:** a lääni ("Mikkeli (St. Michel)", "Viipuri") or a cemetery's maakunta ("Keski-Suomi", "Southern Savonia") between the parish and the country. The parish says which it was in. It's left out only with something before it, so "Mikkeli, Finland", the town, stays. A province named as its town (Mikkeli, Kuopio, Viipuri, Vaasa, Oulu, Hämeenlinna) is taken for the province only as MyHeritage and FamilySearch write it, with its Swedish name or before "Finland", so a tidied "Haukivuoren hautausmaa, Mikkeli, Suomi" keeps its town when tidied again; a hand-written "Kirvu, Viipuri, Suomi" keeps its province.
- **The parish goes by its Finnish name, spelled one way:** "Juva (Jockas)" is Juva, "Pieksamaki" Pieksämäki. A rural parish is named as Astia names its archive's, "Mikkelin maaseurakunta" (Heikki chose this over the municipality, Mikkelin maalaiskunta). The parishes spelled otherwise are a table in the script.
- **A village named as its parish is named once:** the church village, "Haukivuori, Haukivuori", is Haukivuori (Heikki, 2026-11-13). So is any part named as the one above it, a cemetery's municipality too.
- **The farm stays** when the chain has one (880 residences in ylonen); Heikki chose this over a strict "village, parish, country".
- **A one-off script does it,** `scripts/tidy-places`, run on Heikki's datasets (Heikki, 2026-11-13): the name table is this tree's, not the app's. It rewrites every Fact's place, keeps a copy of the database from before, and puts one Change on nothing saying how many. A place's coordinates and notes stay, as it's the same place. It's deleted once it has run. (It was schemas 7 to 9 for a moment; no dataset had opened with them.)
- Places outside Finland are as written.
- **The import keeps places as the file writes them** (Heikki, 2026-11-13): a GEDCOM read in is not renamed. Only ADR-0023's address standing alone is moved there.

## Considered options

- **Village, parish, country only.** Rejected by Heikki: the farm would be lost.
- **Finland rather than Suomi.** Heikki chose Suomi.
- **A migration.** Rejected by Heikki: the app would carry one tree's name table and run it on every dataset.

## Consequences

- No schema change; the Change kind `places-tidied` stays for the script's Changes.
- Still open: the villages' and farms' old spellings ("Wehmais", "Kyrckoby"). Those need a way to rename a place everywhere.
