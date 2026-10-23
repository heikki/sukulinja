Status: ready-for-agent

# The list of all open Reminders

Spec: `.scratch/reminders/spec.md`. Glossary: **Reminder**, **Image**, **Re-scan**, **Scan viewer** (`src/server/citation-scans/CONTEXT.md`).

- **_Reminders (n)_** in the dataset view's Settings popover (`src/client/components/settings/`), n the open count, opens a dialog over the chart.
- **The dialog** lists every open Reminder, newest first, each with what it's on: the person and their years, the Citation's person and source, or the Volume and Image. A stale one (its Image from an earlier filming) is flagged so.
- **Picking one** closes the dialog and selects the person (for a Citation's, its person, with that source unfolded in the panel), or opens the Scan viewer at the Image. A stale one on an Image opens nothing; its menu still works.
- **Opening at an Image needs a way in.** The Scan viewer always opens from a Citation (`openNow` in `src/client/state/viewer.ts`). An Image Reminder opens it with no source, on the Reminder's Volume and Image, with the people beside the scan as usual, much as an Unlinked reference opens it on no Volume.
- **Each row's right-click menu**: _Done_ or _Reopen_, _Edit…_, _Delete_.
- **_Show done_** adds done ones, dimmed.

## Comments
