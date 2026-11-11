# Say what an Entry records and who the person is in it

Status: needs-info

From [fact-citations.md](../fact-citations.md), askel D. Terms: **Event** and **Role** in the Citations glossary.

A Citation made in the app, or converted (ADR-0016), writes GEDCOM's citation `EVEN` and `ROLE`:

- **Event** from the Volume's **Book**: kastetut `CHR`, vihityt `MARR`, rippikirja and lastenkirja `RESI`, haudatut `BURI`. A converted Citation's MyHeritage `EVEN Record` and its record id under `ROLE` are replaced, as they aren't GEDCOM.
- **Role** on a converted **Index reference** from its suffix: none `CHIL`, "-F" `FATH`, "-M" `MOTH`. Elsewhere, none for now.

No schema change: the columns are there and the export writes them.

## Open

- **Role for a Citation made in the Scan viewer.** Asking for it means a choice in "New citation for…" (child, father, mother, godparent, spouse, other). Ask there, or leave it empty until the Entry model?
- **A household line's Role.** GEDCOM's roles don't name a rippikirja's (isäntä, emäntä, lapsi, piika). `OTHER` with a phrase, or none?
