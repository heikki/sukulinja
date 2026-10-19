Status: ready-for-agent
Blocked by: 02

# Draw, adjust and remove the entry Box

Spec: `../spec.md` (Draw the entry…; Adjust the Box; Remove the entry box; What a Mark replaces).

## Do

- Server: a Mark may carry a `box` (fractions of the Image, as `Box` in `src/common/types.ts`; validate 0–1 and non-empty). It goes on the hand Record pin, or on the Reference pin. A cited page marked in a Volume it links becomes a Page pin, and a Page pin has nowhere to keep a Box. If the reference has no record id, also keep a Reference pin with the Image and Box so the Box isn't lost. A given Box replaces the vision one that `matchedBox` would keep.
- Context menu items: Draw the entry… and Remove the entry box.
- Draw: crosshair cursor, drag a rectangle over the stage, Esc cancels. Sets the pending Box and the Image shown, if no Image was set.
- The pending Box is drawn in `sl-scan-entries` with corner and edge handles. Dragging a handle resizes it; dragging inside moves it; dragging elsewhere still pans. Coordinates go through `boxOnStage`'s inverse, so zoom and pan don't skew it.
- Editing a source whose Link is a Vision match starts from the match's Box.
- A Record pin's Box is shared by everyone citing the record. The bar names the others whose entry moves.

## Tests

- pins: a Mark with a Box saves it on the Record pin, on the Reference pin, or on a Reference pin beside the Page pin for a page reference with no record id; a hand Box replaces a vision one.
- server: a Box out of range is refused.
- frame: stage ↔ Image fractions round-trip under zoom and pan.
