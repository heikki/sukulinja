# Select a person without rebuilding the chart

Clicking a card used to make its person **Root**: a **Relayout** rebuilt the **Hourglass chart** around them, and the details dock followed. Going through a household — opening each sibling's sources to check a scan against the others — moved the chart on every click, so the household being compared slid away each time.

Who the chart is built around and who the dock shows are now separate. The **Selected person** is the one the dock shows:

- **A click selects.** The card is ringed, the dock opens on the person, and the chart stays as it is. Clicking the selected card shows or hides the dock. Selecting is only ever for the dock's details, so every selection opens it, whether by a click, making them Root, search or a pick in the dock; only the URL's selection, on arriving or with Back, leaves it as it was.
- **The selected card is shown whole.** If it's cut off at an edge, off-screen, or about to go under the opening dock, the chart glides just far enough to bring it inside the fit margin, in step with the dock's slide. A card already in view doesn't move, so the view being compared against stays put. Of a person drawn more than once, the card needing the least travel is shown; a click shows the card clicked.
- **A card's right-click menu makes Root.** Its one item, Make Root, under the person's name, also selects them, so the dock and the chart agree again; Root's own card opens no menu. On a row of the dock's Family list, whose people may not be drawn at all, a double-click does the same.
- **Search selects,** as a pick in the dock does: someone the chart draws is glided into view, keeping the chart being compared against; anyone else becomes Root. Make Root on their card rebuilds the chart around them.
- **The dock's own picks select.** A click on a row in the Family list, or on a person in the Scan viewer's list, selects them.
- **Selecting someone the chart doesn't draw makes them Root.** Otherwise nothing in the chart would mark them, and the chart has nothing about them to compare against, so rebuilding it loses little. Someone drawn but panned off-screen is selected and glided into view, not rebuilt around.
- **The Scan viewer belongs to the selected person.** Selecting another closes it, unless they were picked in the viewer itself, which goes on with their citation.
- **The URL keeps the selection** as `sel=` when it isn't Root (ADR-0004). Selecting replaces the current history entry; only a Root change pushes one, so Back steps through charts, not through every card looked at.

## Considered options

- **Select someone undrawn without moving the chart,** saying "Not in the chart" in the dock. Rejected: a dead end that Make Root must undo every time.
- **A Center button in the dock** for a selected person who isn't Root. Rejected: a standing band of chrome over the panel, for what the card's menu already does.

- **Keep click making Root; select only from the dock.** Rejected: browsing the chart and browsing the Family list would then work differently, and the chart would still move on every card click.
- **Leave a selected card where it is,** even off-screen or cut off, so the chart never moves on a select. Rejected: a pick in the Family list then marks a card no one can see, and a card clicked at an edge stays half hidden while its details are read.
- **A double-click on a card makes Root.** Rejected: its first click is a click like any other, so it selects first, opening the dock and gliding the card into view, and the Relayout then starts from partway through that glide. Undoing the glide on the second click still shows the select, and ruling it out means a delay on every click.
- **Select on click after a double-click delay.** Rejected: every selection would lag by the double-click interval.

## Consequences

- A quick second click, on a card the first has just selected, doesn't hide the dock again; a slower one on the selected card shows or hides it.
- On the Family list, the click that starts a double-click selects first and writes that into the current history entry, so Back from the new chart returns to the old one with the double-clicked person selected.
- A Ctrl-click, the Mac's right-click, opens a card's menu: it neither selects nor starts a pan.
- Only the selected card is marked, with the ring the Root card used to have. Root needs no mark of its own: the layout places them, and every way of making someone Root selects them too. Two marks on different cards, or stacked on one, read as neither.
- The ring has its own colour token, `--selected-card`; the old Root ring had shared `--focus-ring`, which keyboard focus rings redefine after Tab, and lost its outline then.
