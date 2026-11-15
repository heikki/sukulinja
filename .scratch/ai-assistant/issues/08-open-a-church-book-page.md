# The assistant opens a church book page

Status: needs-triage

## What

When an answer points at a church book page (a Citation's Image, or an Image of a Volume), the assistant can open it in the Scan viewer, so the person sees the page the answer is about without finding it themselves.

## How it could work

- A new kind of tool besides reads and writes: a _show_ tool, `open_page`, that takes a Citation id, or a Volume and an Image number. It reads nothing and changes nothing; the server only checks that the page is the dataset's and passes it on.
- The turn's stream gets a new event, e.g. `{ type: 'open', citationId }` or `{ type: 'open', volumeId, image }`.
- The client shows it under the answer as a button, e.g. "Open I Aa:12 · image 14", which calls the viewer's `open` (at the Citation's Link) or `openImage`. A click, not an automatic open: the answer may be read later, and the viewer belongs to the Selected person (ADR-0011).

## Open questions

- Button under the answer (suggested), or open the viewer at once when the answer arrives?
- Only Citations of the person on screen, or any page of the dataset's parishes?

## Not in this ticket

The assistant _looking at_ the page (reading the scan with a vision model, Vision match style) is a separate feature.
