# The import's crops become Tags

ADR-0017 made a Tag a person's media link made in the app, beside the links an import makes. A MyHeritage export marks people's faces with a `CROP` on their link, so a Photo had two kinds of Box: the import's, which couldn't be edited, and the Tags. Editing an import's Box made a Tag that stood in for it. Heikki (2026-11-11): the MyHeritage crops should be replaced with Tags, so there aren't two systems side by side.

So every Box is a Tag:

- **An import makes each person's `CROP` their Tag.** The link stays as the export has it, without the Box, and the Tag is a link of its own, in an `OBJE` after the person's others, as one made in the app is. A link to a record noting it was added in the app is still the Tag itself (ADR-0017), so a GEDZIP comes back as it was written. A family's, an event's or a citation's link keeps its `CROP`, as nothing tags them.
- **A re-import keeps the dataset's Tags, not the export's crops.** Where the dataset already had the person in the Photo, with a Tag or not, the new export's `CROP` for them is dropped and the dataset's Tag goes back, so a Tag moved or taken back stays so. A `CROP` on a link new to the dataset becomes its Tag. A crop changed in MyHeritage later is so left out (Heikki chose this, 2026-11-11); the MyHeritage import is being given up anyway, and the 5.5.1 export leaves photos out.
- **Schema 2 converts a dataset** (ADR-0018): each person's link with a `CROP` gets a Tag with it, unless they have one there already, and the link loses it. A database from before schema 1, merged into a re-import, has its crops carried as Tags the same way.
- **Reading a Box reads only Tags.** The people of a Photo and the portrait take a person's Box from their Tag; a Photo's person no longer says whether it's a Tag, since a Box always is. Every Box offers _Edit_ and _Delete_. Deleting the Tag leaves the person linked to the Photo without a Box where the import linked them.

## Considered options

- **Keep the import's crops and let a Tag stand in for one** (the step before this). Rejected: two kinds of Box, and a deleted Tag brought the import's back.
- **MyHeritage's crop wins on a re-import.** Rejected by Heikki: a Tag edited in the app would be lost to the next import.
- **Drop `added_in_app`, a Tag being any person's link with a Box.** Rejected for now: it says what the Box says, but removing it rebuilds `media_links`, and the column still tells a GEDZIP's Tag from a plain link when written back. It can go with the next rebuild of the table.

## Consequences

- Schema 2; datasets migrate as they open.
- `PhotoPerson.tagged` is gone; `box !== null` means a Tag.
- Every Tag, MyHeritage's too, is written with `NOTE Added in Sukulinja` in a GEDZIP.
