Status: ready-for-agent

# Write a Reminder in the Scan viewer, and see the Image's

Spec: `.scratch/reminders/spec.md`. Glossary: **Reminder**, **Scan viewer**, **Box**, **Image** (`src/server/citation-scans/CONTEXT.md`).

- **_Add reminder…_** in the scan's right-click menu (`scan-viewer/menu.ts`): over the Image (`linkItems`) and on a Box (`boxItems`), but not while a Box is pending.
- **The dialog**: an _On_ picker, then a multi-line text field, Cancel and Save. The picker lists _This Image_ (named by its Volume and Image number), then for each person beside the scan (`scan-viewer/people.ts`), their Citation, then them. It starts on the Box's Citation when opened from a Box, and on the Image otherwise. Save is disabled while the text is empty.
- **The marker in the page nav** (`scan-viewer/nav.ts`): shown with a count when the Image has open Reminders, on it or on a Citation that links it. Clicking it lists them, each with what it's on and its own right-click menu: _Done_, _Edit…_ (the same dialog, its _On_ fixed), _Delete_. A stale Reminder isn't shown here.
- Keep the nav narrow: the marker is an icon with a count, like ⓘ Old filming.

## Comments
