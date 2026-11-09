Status: ready-for-agent
Blocked by: 06

# Convert a new reference of a converted record at import

Spec: `.scratch/convert-myheritage-citations/spec.md`. Glossary: **Conversion**, **Record pin**, **Church-book reference** (`src/server/citations/GLOSSARY.md`). ADR-0016.

A re-import can bring a new citation of a record already converted, such as a new person citing the same rippikirja household. Its Record pin, read from the converted Citation (ticket 04), already gives it a Link Marked at the entry.

- **After the merge**, a reference whose record or URL a converted Citation cites is given that Citation's Link and converted, as in ticket 06.
- The import review counts them with `converted`.

## Tests

- A re-import with a new person citing a converted record converts their citation, with the same Box.
- A new reference of an unconverted record stays a reference.

## Comments
