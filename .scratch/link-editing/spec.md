# Editing a source's Link in the Scan viewer

Glossary (`src/server/citation-scans/CONTEXT.md`): **Link**, **Mark**, **Box**, **Precision**, **Certainty**, **Reference pin**, **Record pin**, **Page pin**, **Vision match**, **Split**, **Book**, **Volume**.

## Problem

The only Mark in the app is Confirm on a Vision match. When a Link's Volume is wrong (years or a Record range chose badly, or a Split reference opened on the wrong candidate), or its Image is a few off, or the entry is boxed wrong, there is no way to say so. The Scan viewer can't even switch Volumes: it shows only the Volume of the Link it was opened on.

Shipped so far: the pending-change bar with its leaving guard; the scan's context menu with Change Volume… (saved as a Volume-only Mark), Mark this Image, and drawing, adjusting and removing the entry Box (`viewer.ts`, `edit.ts`, `layer.ts`, `menu.ts`, `volumes.ts`, `GET /api/citations/:id/volumes`). Still to come: reusing a Box, and Not known.

## Design

### Pending changes, saved together

Editing is always for the viewer's **current source**, one at a time. Nothing saves as you go. The first change shows a bar over the scan with the Link as it was, the Link as it will be, and **Cancel** / **Save**:

```
┌─ Anna's baptism ───────────────────────────────┐
│ Was:  Estimated Image · I Aa:5 · Image 40      │
│ Now:  Marked · I Aa:6 · Image 12 · entry box   │
│                          [Cancel]  [Save]      │
└────────────────────────────────────────────────┘
```

- **Save** sends one Mark: Volume, and the Image and Box if set. **Cancel** drops the pending change and takes the viewer back to the Link.
- Leaving with changes pending (opening another source, ↑/↓, picking a person beside the scan, selecting someone else, closing the viewer, Esc) pauses, and the bar asks "Save this change first?" with **Save** / **Discard** / **Keep editing**. No browser dialogs: they freeze the app's WebView.
- Picking a person beside the scan still selects them. With changes pending, the bar asks first.

### What you can change

- **Change Volume…**: the list of the parish's Volumes in the same Astia series as the reference's Book. It has two groups: _Fits the reference_ (the Volumes its years or Record range give, worked out without its own pin, as `matchCandidates` does with `byBook(pins)`), then _Other Volumes_ by years, each with its code and years. Picking one shows it and sets the pending Link to that Volume, with no Image (Marked Volume). It opens from the scan's context menu, where you right-clicked; the toolbar only names the Volume shown. There's no separate browse-only switcher: Cancel undoes a look. Its own Volume is no change, unless the reference is Split.
- **Not known**: a row at the foot of the Change Volume list, for a reference whose Volume you've looked for and can't tell (`issues/06-not-known.md`).
- **Mark this Image**: sets the pending Image to the one shown, in the Volume shown, with no Box (Marked Image). On a Vision match's Image it drops the match's Box; Confirm keeps it.
- **Draw the entry…**: the cursor becomes a crosshair; drag a rectangle, Esc cancels. It sets the pending Box, and the Image shown if it wasn't set yet.
- **Edit box**: on the source's own entry Box, makes it pending (a Vision match's too), to adjust. While a Box is pending it has corner and edge handles, dashed in the accent. Dragging a handle resizes it; dragging inside moves it; dragging elsewhere still pans.
- **Delete box**: on the source's own entry Box, back to Marked Image.
- **This is the entry for <source>**: on an existing Box on the Image, copies that Box into the pending change, e.g. a parent's citation of a child's baptism already boxed for the child.

A pending change starts from the Link as it is. Editing a Vision match starts from the match's Box, and Save makes it a hand Mark at that Box (or wherever it was moved).

### Ways in

- **Context menu** on the scan, drawn in the page. The app blocks WebKit's own menu there. On the source's own entry Box it offers only that Box: Edit box (unless it's already pending) and Delete box. Elsewhere: Mark this Image (while it would change the Link), Draw the entry…, Change Volume…. Right-clicking someone else's Box offers "This is the entry for <source>". It handles Esc and focus as the viewer's other controls do (marked handled, so macOS doesn't beep).
- **Confirm** on a Vision match's row stays one click and saves at once. Fixing the match goes through editing instead.

### What a Mark replaces

- A Mark in another Volume replaces the reference's Link, whatever its Precision.
- Volume-only: a hand Reference pin `{ volumeId, volume, by: 'hand' }` with no Image or Box. No Record or Page pin, no Record range change. Other pins stay, including a hand Record pin for the same record elsewhere, which still holds for others citing it.
- A later Image Mark or Confirm replaces a Volume-only pin. `markInto` already does: it overwrites the Reference pin, or clears it when the Mark becomes a Page pin.
- A Box on a Record pin is shared by everyone citing that record, so editing it moves theirs too. The bar names them: "Also moves the entry for Juho, Maria."

## Out of scope

- Clearing a saved Mark back to the estimate: `issues/05-clear-a-mark.md`.
- Editing several sources at once.
- Creating a Citation from the scan: `../create-citations/issues/01-cite-from-the-scan.md`. Keep the pending change (Volume, Image, Box) separate from the stored Citation, and keep drawing and reusing a Box independent of whose source it is, so a new Citation can later go through the same bar and menu.

## Glossary to update as it ships

**Unlinked**: a person may say the Volume isn't known.
