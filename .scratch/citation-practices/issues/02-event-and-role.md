# Say what an Entry records and who the person is in it

Status: ready-for-agent

From [fact-citations.md](../fact-citations.md), askel D. Terms: **Event** and **Role** in the Citations glossary.

## What to build

A Citation made in the app, or converted (ADR-0016), writes GEDCOM's citation `EVEN` and `ROLE`. No schema change: the columns are there and the export writes them.

- **Event** from the Volume's **Book**: kastetut `CHR`, vihityt `MARR`, rippikirja and lastenkirja `RESI`, haudatut `BURI`. A converted Citation's MyHeritage `EVEN Record` and its record id under `ROLE` are replaced, as they aren't GEDCOM.
- **Role on a converted Index reference** from its suffix: none `CHIL`, "-F" `FATH`, "-M" `MOTH`.
- **Role in "New citation for…"**, only for a baptism or a marriage (Heikki, 2026-11-11): beside picking the person, an optional choice of child, father, mother, godparent (`GODP`) for a baptism, and groom (`HUSB`), bride (`WIFE`) for a marriage. Not asked for a rippikirja or lastenkirja.
- **No Role for a household line** (Heikki, 2026-11-11): isäntä, emäntä or piika says who the person is in the household, which the Transcription holds, not their Role in the Entry. No `OTHER` with a phrase.

## Acceptance

- A Citation made in a kastetut Volume has `EVEN CHR`, and the Role chosen, in the GEDZIP.
- A converted "-F" reference has `ROLE FATH`; MyHeritage's `EVEN Record` is gone from it.
- A rippikirja Citation has `EVEN RESI` and no `ROLE`.
- UI checked in the browser with `bun dev`, in dark mode.
- `bun fmt`, lint, typecheck and tests pass.
