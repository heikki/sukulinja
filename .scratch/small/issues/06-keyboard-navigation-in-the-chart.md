Status: needs-triage

# Move around the chart with the keyboard

Glossary: **Hourglass chart**, **Root**, **Selected person**, **Relayout**, **Pin**, **Nudge**, **Box key** (`src/client/components/tree-view/CONTEXT.md`).

The chart is mouse-only. A card is selected by clicking it and made Root from its right-click menu; cards aren't focusable and the chart has no keys of its own. The arrow keys do nothing there (`quiet-keys.ts` marks them handled so WebKit doesn't beep).

Let the arrow keys move the **Selected person** across the chart, and a key make them **Root**, so a tree can be walked without the mouse.

## Open questions

- **What the arrows follow.** Kinship (↑ a parent, ↓ a child, ←/→ a sibling or spouse) or the layout (the nearest card that way on screen). Kinship reads the same whatever the layout does, but has to pick which parent and which child, and dead-ends where the chart draws no more (↓ from an **Aunt/Uncle**, ↑ above the **Generation limit**); the layout way always lands somewhere but can jump across a gap to someone unrelated.
- **Boxes or people.** One person can be drawn as several boxes (pedigree collapse). Moving should probably go box to box (**Box key**), so ↑ from a copy climbs that copy's line.
- **Keyboard focus or selection.** Move the Selected person itself (the dock follows each step), or a separate focus ring that Enter turns into a selection. The first is simpler; the second keeps the dock still while browsing. CONTEXT.md keeps "focus" for keyboard focus, so a second marker needs its own name.
- **Off screen.** Stepping to a card outside the view should pan just enough to bring it in, like a **Nudge**, without changing zoom.
- **Making Root.** Which key builds the tree from the selected card (Enter, or ⌘↩ if Enter only selects). After the **Relayout** the selection stays on the new Root.
- **The rest of the card menu.** The context-menu key or Shift-F10 to open it on the selected card, Escape to hide the dock.
- **Zoom and pan keys.** Whether +/− and a reset belong here too, or stay with the pointer and the app menu.
- **Getting in.** Arrows act whenever nothing else holds focus (search field, Scan viewer, settings), or only after the chart is clicked or tabbed into. The Scan viewer already takes the arrows while it's open.

## Comments
