Status: resolved

# Clear a saved Mark

Spec: `../spec.md` (Out of scope).

A saved hand Mark can only be replaced by another Mark, never taken back. Cancel only drops changes not yet saved. Clearing a Mark would take the reference back to its estimate: the Volume by the Book's years or Record range, and the Image counted from Page pins.

## Open questions (decide before agent work)

- What a Mark left behind, and what clearing removes. A Reference pin is the reference's own, but a Page pin or Record pin from a Mark also moves other references, and a Record pin may have extended a Record range.
- Whether clearing brings back a Vision match the Mark replaced.
- Whether it's a pending change saved with Save, like the rest, and where it's offered: the context menu, the person panel, or both.

## Answer

Shipped as **Discard mark** (and **Discard match** for a Vision match) on the Box's menu; see the spec's "What you can change". Only Boxes are discarded: they're all a person adds. Discard removes the Reference and Record pins boxing the entry there, keeps Page pins and Record ranges, and doesn't bring back a Vision match the Mark replaced (the vision pass may find it again). It waits in the nav to be confirmed, like a pending Box.
