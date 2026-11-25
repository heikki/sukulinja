# Only the dock opens and closes itself

Selecting a person opened the details dock, whether by a click on a card, making them Root, search, a pick in the dock or a Reminder or Change picked in the corner lists; clicking the selected card and Space showed or hid it (ADR-0011). Heikki (2026-11-25) found Space typed into the name form in the dock's header closing the dock, and asked for the dock to open and close only from its own header and rail: a dock sliding in and out on its own was too much going on.

- **Only the dock's header and rail open and close it.** Selecting, by any way there is, shows the person in the dock as it is, open or closed. A click on the selected card does nothing more, and Space nothing on the chart.
- **The header holds a button rather than being one.** A click anywhere on it still closes the dock, and its chevron is the button the keyboard reaches. A field in a button presses the button with every Space typed into it, so the name form in the header closed the dock.
- **The dock opens as it was left.** Open or closed is kept in a cookie beside its width, so starting the app or entering a dataset finds it as it was.
- **Its sections open as they were left, and none at first.** Events, Family, Photos and Sources are kept open or closed in a cookie (Heikki, 2026-11-25); Sources was open at first. The Scan viewer turning to a source scrolls Sources to it only if it's open. A source picked under a Fact still opens Sources, as the only place its record shows.
- **A card being selected is shown clear of the dock as it is,** not of one about to open. Opening the dock glides the ringed card clear of it, in step with its slide, if it would go under.

## Considered options

- **Keep opening the dock on a select, and only stop Space in fields.** Rejected: Heikki asked for no opening or closing but the dock's own.

## Consequences

- With the dock closed, selecting only rings the card and names the person on the rail; picking a Change or Reminder about a person doesn't show it until the dock is opened.
