Status: ready-for-agent

# Mark this Image, from a context menu, a button and M

Spec: `../spec.md` (What you can change; Ways in).

## Do

- The scan's context menu, drawn in the page: block WebKit's own menu over the stage, position the menu at the pointer, handle Esc and focus as the viewer's other controls do (marked handled, so macOS doesn't beep), and close on click elsewhere. Items so far: Mark this Image, Change Volume….
- Mark this Image sets the pending Image to the one shown, in the Volume shown, with no Box.
- A Mark button in `sl-scan-nav`, and M (in `keys.ts`; not while typing): Mark this Image. Hidden when it wouldn't change the pending or saved Link.
- Save sends `{ volumeId, image }` through the existing Mark path.

## Tests

- viewer state: Mark this Image on a Volume-only pending change keeps the Volume and adds the Image; marking the Image the Link already has is no change.
- keys: M marks, and doesn't while typing in the Image number.
