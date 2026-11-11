# A Tag is a person's media link made in the app

A **Tag** says who is where in a Photo: the Photo, the person and their **Box**. It's made in the Photo viewer, moved and taken back there, and a re-import has to keep it (ticket photos/02). An import already stores the same shape: a person's `OBJE` link with a `CROP` is a `media_links` row, as MyHeritage's face crops come in, and the GEDZIP export writes one back the same way.

A Tag is now such a row, marked as the app's:

- **`media_links.added_in_app`**, as on citations. A Tag is on a person and always has its Box (a `CHECK`), and a person has at most one Tag on a Photo (a unique index over the Tags). Only Tags can be moved or taken back; a link an import made, with a Box or not, is the export's.
- **Everything reading a person's photos reads Tags as it is.** The person's _Photos_, the people of a Photo, the portrait, the export's `OBJE` links and the rule that a `media` row with no link is a Photo linked to no one need no second table. A Photo tagged and nothing else is linked to its person.
- **A Tag stands in for the import's Box.** Editing a Box the import gave (Heikki, 2026-11-11: _Edit_, as on a Citation) makes a Tag of the person there; the import's link stays as it was, so the next import can't undo the edit, and the app shows the Tag's Box wherever it shows theirs. Only a Tag can be deleted: the import's Box would come back with the next import. One linked without a Box can be tagged too, and their Tag gives them the Box.
- **The portrait** stays the person's first photo, cropped to their Box on it: their Tag's, else the import's `CROP`. Choosing the portrait is later.
- **A Tag is a Change on its person**, named by the Photo's file name: tagged, moved or taken back.
- **The GEDZIP export writes a Tag as the person's `OBJE` link with its `CROP`**, to an `OBJE` record of its own carrying `NOTE Added in Sukulinja`, which the import reads back into `added_in_app`. The 5.5.1 file for MyHeritage leaves photos out, as before.
- **Re-importing** (ADR-0013): the export's own part of a Photo, its file, links and crops, comes from the new export. Each Tag goes back onto the same person, by `UID`, and the same Photo, by its `original_path`, as photos are already found again across imports. It stands in for the Box the new export gives them there, as before; one the new import has already, from a GEDZIP, isn't made twice. One whose person or Photo is gone is listed before you confirm.

## Considered options

- **A table of its own, `tags`, keyed by the Photo and the person.** Rejected: it stores no less (a link row's `object_order` and `sort_order` are numbers it needs anyway to be written in order), and every reader of a person's photos would read two tables: the panel, the Photo viewer, the portrait, the export, and the merge's and export's rule for a Photo linked to no one.
- **Mark the import's own link with the Tag's Box.** Rejected: a re-import takes the export's links from the new export, so the Box would be lost or have to be told apart from the export's crop.
- **Write a Tag without the note.** Rejected: a GEDZIP imported again would turn every Tag into the export's link, which can't be moved or taken back.

## Consequences

- Schema 11: every dataset is imported again, which merges as ADR-0013 says.
- `ImportReview` counts the Tags kept.
- A Photo whose Tags are all taken back and that nothing else links stays, as a Photo linked to no one.
