# Select a person without rebuilding the chart

Clicking a card used to make its person **Focus**: a **Relayout** rebuilt the **Hourglass chart** around them, and the details dock followed. Going through a household — opening each sibling's sources to check a scan against the others — moved the chart on every click, so the household being compared slid away each time.

Who the chart is built around and who the dock shows are now separate. The **Selected person** is the one the dock shows:

- **A click selects.** The card is tinted, the dock moves to the person, and the chart stays as it is.
- **A double-click makes Focus.** It also selects, so the dock and the chart agree again. It works the same on a row of the dock's Family list, whose people may not be drawn at all.
- **Search makes Focus.** Picking someone there is a jump elsewhere, not a look at someone on screen.
- **The dock's own picks select.** A click on a row in the Family list, or on a person in the Scan viewer's list, selects them.
- **Selecting someone the chart doesn't draw makes them Focus.** Otherwise nothing in the chart would mark them, and the chart has nothing about them to compare against, so rebuilding it loses little. Someone drawn but panned off-screen is only selected: panning would move the view being compared against.
- **The Scan viewer belongs to the selected person.** Selecting another closes it, unless they were picked in the viewer itself, which goes on with their citation.
- **The URL keeps the selection** as `sel=` when it isn't Focus (ADR-0004). Selecting replaces the current history entry; only a Focus change pushes one, so Back steps through charts, not through every card looked at.

## Considered options

- **Select someone undrawn without moving the chart,** saying "Not in the chart" in the dock. Rejected: a dead end that a double-click must undo every time.
- **A Center button in the dock** for a selected person who isn't Focus. Rejected: a standing band of chrome over the panel, for what a double-click already does.

- **Keep click as Focus; select only from the dock.** Rejected: browsing the chart and browsing the Family list would then work differently, and the chart would still move on every card click.
- **Select on click after a double-click delay.** Rejected: every selection would lag by the double-click interval to keep the history entry of the chart a double-click leaves.

## Consequences

- The click that starts a double-click selects first and writes that into the current history entry, so Back from the new chart returns to the old one with the double-clicked person selected.
- The Focus card's ring has its own colour token, `--focus-card`; it had shared `--focus-ring`, which keyboard focus rings redefine after Tab, and lost its outline then.
