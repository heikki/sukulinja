Status: ready-for-agent

# Move around the chart with the keyboard

Glossary: **Hourglass chart**, **Root**, **Selected person**, **Relayout**, **Generation limit**, **Aunt/Uncle**, **Husband-left convention**, **Box key** (`src/client/components/tree-view/CONTEXT.md`).

The chart is mouse-only. A card is selected by clicking it and made Root from its right-click menu; cards aren't focusable and the chart has no keys of its own. The arrow keys do nothing there (`quiet-keys.ts` marks them handled so WebKit doesn't beep).

Let the arrow keys move around the chart, and Enter make a card **Root**, so a tree can be walked without the mouse.

## Selected box

One person can be drawn as several boxes (pedigree collapse), and ↑ from a copy should climb that copy's line, so the chart keeps a **Selected box** (by **Box key**) beside the **Selected person**. The dock and the URL's `sel=` stay per person.

- Only the Selected box is ringed; today every copy of the Selected person is.
- A click picks the box clicked. Selecting from the dock, search, a reload or Back/Forward picks the copy the selection pan brings into view (`showCard` in the viewport already chooses it).
- A Generation Relayout keeps the box, since Box keys survive it. A Root Relayout lands on Root's only box.
- `sel=` stays a person id; the Box key isn't stored in the URL.
- **Selected box** joins CONTEXT.md when this lands.

## Moving

Arrows move the Selected box, and the Selected person follows it.

- **↑** goes to a parent of the box, **↓** to a child, whichever is horizontally nearest on screen (distance between card centres; a tie goes to the left card, so a card centred under a couple goes to the father by the **Husband-left convention**). Only parents and children the chart draws count.
- **←/→** step to the next card on the same row, in drawn order.
- **Dead ends do nothing**: ↓ from an **Aunt/Uncle**, ↑ at the **Generation limit** or from someone whose parents aren't drawn, ←/→ at a row's end. Rows don't wrap. The key is still marked handled, so WebKit doesn't beep.
- **Off screen**: a step to a card outside the view glides the pan just far enough to show it, without changing zoom, as selecting does today.
- Arrows pressed while a Root **Transition** runs act on the new chart.

## The dock

- A step leaves the dock as it is: a hidden dock stays hidden, an open one follows the selection. A click on a card still opens it, as today.
- The ring moves at once; the person's details load once the keys pause (about a quarter second), so a held arrow doesn't fire a fetch per repeat.
- **Space** shows or hides the dock, as a click on the selected card does. **Escape** hides it.

## Making Root

- **Enter** makes the Selected box's person Root (Build tree from here). On Root's own card it does nothing.
- After the Relayout, Root's box is the Selected box. The re-root lands in history like a click's, so Back undoes it.
- No key opens the card menu: Build tree from here is its only item.

## When the keys work

Whenever no field, dialog, menu, settings or the Scan viewer holds focus; the chart needn't be clicked or tabbed into first. The Scan viewer keeps its own arrows while it's open.

## Out of scope

- Zoom keys. Zoom stays pointer-only (wheel, pinch, double-click on empty canvas to fit); a View menu with zoom items would be its own ticket.
- ⌘[ / ⌘] for Back/Forward.
- Screen-reader announcements of the Selected person.

## Experiments

- **Fainter mark on the other copies.** Once only the Selected box is ringed, try a lighter ring on the Selected person's other boxes, so a repeated person still shows where else they're drawn. Keep it only if it doesn't read as a second selection. It needs nothing beyond each box's person id and Box key.

## Comments
