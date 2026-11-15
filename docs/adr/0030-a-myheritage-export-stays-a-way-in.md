# A MyHeritage export stays a way in

ADR-0016 and ADR-0021 planned to remove `citations/myheritage/` once Heikki's own Church-book references were all Marked: the folder, `link_by = 'vision'` and the `rejections` table were to go in one schema change. Heikki decided (2026-11-15) that the app should keep reading a MyHeritage GEDCOM export for others starting their tree from one, and keep what it then takes to work through that export's references: their estimates, Matches and Vision Match (ADR-0029).

- **The MyHeritage import stays**, as a way to start a new dataset (ADR-0021's "until it's removed" is lifted). An import still only makes a new dataset; nothing goes back to MyHeritage.
- **`citations/myheritage/` stays** with it: Record ranges, Page pins, estimates, Matches, the Reader and Vision Match are how an imported reference reaches its scan. A Mark at the entry still converts it (ADR-0016), so a reference is worked through once and then is an Entry like any other.
- **What goes is what was only for Heikki's datasets**: one-off scripts over them, and fixes of their data, which stay out of the import (as before).
- **What only a re-import into the dataset needed goes** (Heikki, 2026-11-15), with the Rejections, no longer written or read (ADR-0029). Schema 10 drops the `rejections` table and the Changes of an import undone, and takes out what an import's Change said of a merge (`merged`, `lost`) and a Discard's of a Rejection. It's the one step that drops Changes, an exception to ADR-0018 Heikki asked for: they told of something the app no longer does. An older local pins file's Rejections go when it's next written.

## Consequences

- The MyHeritage leftovers list loses its "waits for every reference to be Marked" part: that code is kept, not waiting to be removed.
- Open: how well the estimates serve someone else's export, which cites other parishes. The shipped Page pins are Heikki's work on his parishes, so another tree has fewer to go by, and Vision Match matters more there.
