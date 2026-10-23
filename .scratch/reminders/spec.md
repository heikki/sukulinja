Status: ready-for-agent

# Reminders on an Image, a Citation or a person

Glossary: **Reminder**, **Citation**, **Annotation**, **Image**, **Volume**, **Box**, **Re-scan**, **Scan viewer** (`src/server/citation-scans/CONTEXT.md`).

While working through the books you find things to come back to: "check the 1803 rippikirja for a second wife", "this Mark might be the wrong Juho", "the bottom half of this Image is a later hand". Today there's nowhere in the app to write them down. A **Reminder** is a short text written in the Scan viewer on an Image, a Citation or a person, which stays open until it's marked done, and every open one can be gone through in one place.

## Decided 2026-10-23

- **Name:** Reminder. "Annotation" is already a Citation's app-made additions (`src/server/annotations.ts`, ADR-0013), and "note" clashes with GEDCOM `NOTE`.
- **What it's on:** one of
  - an **Image** of a Volume, by the Volume's Astia id and label, the Image number and the Image's file id;
  - a **Citation**;
  - a **person**.

  Not families or Volumes for now.

- **App only.** No export writes it, neither the GEDZIP nor the MyHeritage `.ged`, and an import never reads one. It lives in the dataset's database like a Rejection, which also has no GEDCOM form. Going out and back in as a GEDZIP to a new dataset loses it; a re-import into the same dataset keeps it through the merge.
- **The re-import merge** carries each Reminder:
  - on a person, to the same person, by `UID` (or record id for a file without `UID`s), as an app-made Citation is;
  - on a Citation, to the Citation the merge pairs it with, the stored one kept. A Citation's Reminder whose Citation is gone falls back onto that Citation's person;
  - on an Image: as it was, since it's not about the tree.

  One whose person is gone is listed before you confirm the import, as an app-made Citation that can't be reattached is, and dropped.

- **Per dataset.** A Reminder on an Image belongs to the dataset it was written in, not shared like Page pins.
- **Done.** A Reminder can be marked done and reopened. Done ones drop out of the lists and counts, and come back with a _Show done_ toggle.
- **Written in the Scan viewer only, for now.** _Add reminder…_ in the scan's right-click menu, over the Image and on a Box. It opens a small dialog: an _On_ picker, a multi-line text field, Cancel and Save. The picker lists this Image, then each person whose Citation links the Image shown (the people beside the scan): their Citation, then them. It starts on the Box's Citation when opened from a Box, and on the Image otherwise.

  ```
  Add reminder

  On: [ This Image (I Aa:5, Image 214)        v ]
        This Image (I Aa:5, Image 214)
        <person> — their Citation
        <person>
        …

  +----------------------------------------+
  |                                        |
  +----------------------------------------+
                           [Cancel] [Save]
  ```

- **Each Reminder's own menu**, wherever it's listed: _Done_ (or _Reopen_), _Edit…_ (the same dialog, its _On_ fixed), _Delete_.
- **Where they're seen:**
  - **The Scan viewer**: a marker with a count in the page nav when the Image shown has open Reminders, on it or on the Citations that link it; clicking it lists them.
  - **The person panel**: a Reminders section with the person's own Reminders, and a Citation's shown beside that Citation in the sources. The section is there while they have open ones, or any done ones of theirs or their Citations', so _Show done_ can be reached.
  - **All open Reminders**: a Reminders row in the dataset view's Settings popover, its link _n open_, opens a dialog listing every open one, with what it's on. Picking one closes the dialog and selects the person, the dock open (for a Citation's, the Citation's person, its source unfolded), or opens the Scan viewer at the Image with no source, where only a Reminder can be written.
- **After a Re-scan**, a Reminder on an Image keeps the Image's old file id. It's stale: no longer shown on the Image in the Scan viewer, and flagged as from an earlier filming in the all-open list, where it can still be edited, marked done or deleted.

### Follows from these

- **A new table bumps `SCHEMA_VERSION`**, so every dataset's database refuses to open until it's imported again, which the merge handles. The schema bump goes in the same release as the first Reminder UI, so it only costs one re-import.
- **ADR-0013** gains a line saying Reminders, like Rejections, stay in the app, so a GEDZIP doesn't carry them.
- **A Citation shared by a record**: a Mark is written into every citation of the record, but a Reminder is on one person's Citation. The picker names whose.

## Tickets

- 01, the server: the table, the routes, and the merge: built.
- 02, the Scan viewer: writing one, and the marker in the nav: built.
- 03, the person panel's Reminders: built.
- 04, the list of all open Reminders: built.

## Comments
