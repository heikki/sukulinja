# The assistant steers the view

Status: needs-triage

## What

Besides reading and proposing changes, the assistant can move what the person sees, on their behalf:

- **Select a person**: the chart is then built around them, as when the person picks someone in Find person.
- **Change the Generation limit**: how many generations the chart shows (1–5).
- **Open a church book page**: a Citation's Image, or an Image of a Volume, in the Scan viewer.

So "show me Liisa Malli's ancestors three generations back and open her baptism" can be done in one question.

## How it could work

- A third kind of tool besides reads and writes: _show_ tools, `select_person`, `set_generations`, `open_page`. They read nothing and change no data; the server only checks the person or page is the dataset's and passes the step on.
- The turn's stream gets a new event, e.g. `{ type: 'show', select: 12 }`, `{ type: 'show', generations: 3 }`, `{ type: 'show', citationId: 40 }` or `{ type: 'show', volumeId, image }`.
- The client applies them through the app's own state: Selected person, the chart's Generation limit, the viewer's `open` (at the Citation's Link) or `openImage`. Opening a page follows the select, since the viewer belongs to the Selected person (ADR-0011).
- Each step is also shown under the answer ("Selected Liisa Malli", "Opened I Aa:12 · image 14") so it's clear what moved and why.
- Selecting someone changes who is "on screen", so the living-people rule (ADR-0025) follows the person selected, as it does when the person selects them.

## Open questions

- Steps happen at once (suggested, they change no data and are easy to undo), or as a button under the answer?
- A pending change in the Scan viewer: the step waits for save or discard as any other leave does.

## Not in this ticket

The assistant _looking at_ the page (reading the scan with a vision model, Vision match style) is a separate feature.
