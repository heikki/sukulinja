# What the app made is told by what it holds

Amends ADR-0016, ADR-0017 and ADR-0020.

`added_in_app` marked a Citation and a Tag as the app's, and a GEDZIP carried it as `NOTE Added in Sukulinja` so an import could tell them back. Since ADR-0021 an import only makes a new dataset, and every Citation the app makes cites an Entry (ADR-0026). Heikki (2026-11-26): the flag isn't needed, and older GEDZIPs needn't be read as before.

So schema 16 drops the column from both tables:

- **A Citation is the app's when it cites an Entry** (`entry_id IS NOT NULL`). A converted reference cites one too. One without, whatever its Link, is a reference or an imported citation.
- **A Tag is a person's media link with a Box.** The unique index over Tags is over those links, and the `CHECK` goes with the column. An import makes a person's `CROP` their link's own Box, not a Tag beside a plain link, so a GEDZIP comes back as written.
- **The export writes no `NOTE Added in Sukulinja`**, on citations or on Tags' `OBJE` records. An import reads such a note in an older GEDZIP as any other note.

## Consequences

- An import gathers a hand Box with no Entry into an Entry, as a hand Mark with a Box makes one in the app. A Conversion gathers only the Citations it converted.
- Taking back an imported person's Tag takes their link to the Photo with it, as for a Tag made in the app; ADR-0020's plain link left behind is only in datasets imported before.
- No dataset at schema 15 held a Citation flagged as the app's with no Entry (checked 2026-11-26), so the step converts none.
