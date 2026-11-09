Status: ready-for-agent
Blocked by: 06

# Convert every reference already Marked at the entry, once

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Conversion**, **Mark**, **Box** (`src/server/citations/GLOSSARY.md`). ADR-0016.

- **A one-off script** in `scripts/`, run with `bun` on a dataset's database, converting every reference Marked by hand at the entry through ticket 06's module, in one transaction per dataset. It keeps a copy of the database from before it beside it, since _Undo last import_ can't undo a script.
- It prints how many citations it converted, per Volume.
- **Run on a copy of the real dataset first**, and compare the person panel for a few people before and after.
- Deleted after it has run, with a line in ADR-0016's consequences, as ADR-0013's pin move was.

## Tests

- On a fixture with references Marked at the entry, at the Image, at the Volume, and an unchecked Match: only the first convert, and running it twice changes nothing.

## Comments
