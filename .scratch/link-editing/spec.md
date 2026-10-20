# Editing a source's Link in the Scan viewer

Glossary (`src/server/citation-scans/CONTEXT.md`): **Link**, **Mark**, **Box**, **Precision**, **Certainty**, **Reference pin**, **Record pin**, **Page pin**, **Vision match**, **Split**, **Book**, **Volume**.

## Problem

The only Mark in the app is Confirm on a Vision match. When a Link's Volume is wrong (years or a Record range chose badly, or a Split reference opened on the wrong candidate), or its Image is a few off, or the entry is boxed wrong, there is no way to say so. The Scan viewer can't even switch Volumes: it shows only the Volume of the Link it was opened on.

Shipped so far: Cancel and Save in the nav while a Box is pending, with its leaving guard; the scan's context menu with Change Volume… (only showing another Volume), and placing and editing the entry Box (`viewer.ts`, `edit.ts`, `layer.ts`, `menu.ts`, `volumes.ts`, `GET /api/citations/:id/volumes`).

## Design

### Pending changes, saved together

Editing is always for the viewer's **current source**, one at a time, and a change is always a Box: where on an Image of a Volume the entry is. Nothing saves as you go. A pending Box is dashed, and while it's pending **Cancel** / **Save** sit at the end of the nav, after a divider, so every control over the scan is in one place. Boxes go under the nav; the menus go over it.

```
┌───────────────────────────────────────┐
│  ‹  [ 18 ] of 40  ›  │ [Cancel] [Save] │
└───────────────────────────────────────┘
```

- **Save** sends one Mark: the Volume, Image and Box. **Cancel** drops the pending Box and takes the viewer back to the Link.
- Leaving the Box's Image with it pending (showing another Image or Volume, opening another source, ↑/↓, picking a person beside the scan, selecting someone else, closing the viewer) pauses, and in the nav, in place of Cancel / Save, it asks "Save this box first?" with **Keep editing** / **Discard** / **Save**. No browser dialogs: they freeze the app's WebView.
- Picking a person beside the scan still selects them. With a Box pending, it asks first.
- **Esc** backs out one step: from that question back to editing, from editing (dropping the Box, as Cancel does), else out of the viewer.

### What you can change

- **Change Volume…**: the list of the parish's Volumes in the same Astia series as the reference's Book. It has two groups: _Fits the reference_ (the Volumes its years or Record range give, worked out without its own pin, as `matchCandidates` does with `byBook(pins)`), then _Other Volumes_ by years, each with its code and years. Picking one only shows it: the Link stays as it is until a Box is saved there. The source's own Volume opens on its Link's Image. It opens from the scan's context menu, where you right-clicked; the toolbar only names the Volume shown. Marking only a Volume isn't offered: Volume-only Marks already saved still show.
- **Mark entry**: makes the source's own Box on the Image shown pending, as it does on that Box (a Vision match's too); without one, puts a pending Box centred where the menu opened, as big as the Image's other entries' Boxes (their median; with none, the usual entry size), with handles to move and resize it. It puts the source on the Image and in the Volume shown.
- **Edit mark** on the source's own entry Box (**Edit match** on a Vision match's): makes it pending, to adjust. While a Box is pending it has corner and edge handles, dashed in the same red as the entries' Boxes. Dragging a handle resizes it; dragging inside moves it; dragging elsewhere still pans.
- **Discard changes**: on the pending Box, drops the pending change, as Cancel does. There's no marking an Image without its Box from the menu: Marked Image Links already saved still show.
- **Discard match** / **Discard mark**: on a Vision match's or a Mark's own Box, takes the Box back to the estimate. Only Boxes are discarded, since they're all a person adds. The Box shows faint and the nav asks "Discard this match?" (or "this mark?") with **Cancel** / **Discard**; Esc cancels, and moving off the Image drops it without asking. Discard removes the reference's Reference pin and its record's Record pin boxing the entry there, whoever saved them; Page pins and Record ranges stay, as facts about the Volume. A Vision match taken back is saved as a Rejection of that Image for the reference (`rejected` in `pins.local.json`): the vision pass never saves a match there again, and lists one landing there for review by hand. A Mark taken back is no Rejection. A Record pin is shared by everyone citing the record, so the nav names them: "Also for Juho, Maria." Served as `DELETE /api/citations/:id/scans` with `{ volumeId, image }`.

A pending change starts from the Link as it is. Editing a Vision match starts from the match's Box, and Save makes it a hand Mark at that Box (or wherever it was moved).

### Ways in

- **Context menu** on the scan, drawn in the page. The app blocks WebKit's own menu there. It's titled with the source's person, as People here names them (untitled when unnamed). On the source's own entry Box it offers only that Box: Edit match and Discard match on a Vision match, Edit mark and Discard mark on a Mark; once it's pending, only Discard changes. Elsewhere: Mark entry, Change Volume…. It handles Esc and focus as the viewer's other controls do (marked handled, so macOS doesn't beep).
- **An Unlinked source** whose parish's books were looked through (no Volume fits, or its Volume isn't digitized or has no Images) opens the viewer on no Volume: the reason, and **Choose a Volume…**, the Change Volume list, from a button or a right-click. Its group is the parish's other Volumes of the Book. Once one is shown, Mark entry saves as anywhere else; Cancel stays on the Image, having no Link to go back to. In the person panel such a source sits under its parish's archive, after the linked ones. The resolution carries the archive for this (`{ unlinked, archive }`).
- **Confirm** on a Vision match's row beside the scan, and only there, stays one click and saves at once; the row shows it saving, and why it's refused. Fixing the match goes through editing instead.

### What a Mark replaces

- A Mark in another Volume replaces the reference's Link, whatever its Precision.
- A Mark or Confirm replaces a Volume-only pin saved earlier. `markInto` already does: it overwrites the Reference pin, or clears it when the Mark becomes a Page pin.
- A Box on a Record pin is shared by everyone citing that record, so editing it moves theirs too. Before Cancel / Save the nav names them: "Also moves Juho, Maria."

## Out of scope

- Editing several sources at once.
- Saying a reference's Volume isn't known: its estimate already says it's a guess, and a hand pin without a Volume would need a Link that's unlinked yet openable, and would block later vision matches (`issues/06-not-known.md`, wontfix).
- Reusing another source's Box for this one: people citing the same record already share a Box, and another entry is one drag to draw (`issues/04-reuse-a-box.md`, wontfix).
- Creating a Citation from the scan: `../create-citations/issues/01-cite-from-the-scan.md`. Keep the pending Box separate from the stored Citation, and keep placing a Box independent of whose source it is, so a new Citation can later go through the same Cancel / Save and menu.
