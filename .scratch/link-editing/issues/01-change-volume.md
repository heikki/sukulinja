Status: ready-for-agent

# Change a source's Volume, saved with Save

Spec: `../spec.md` (Pending changes; Change Volume…; What a Mark replaces).

The first slice: the pending-change bar, with Change Volume… as its only change, opened from the toolbar's Volume name. No context menu yet.

## Do

- Server: `MarkTarget.image` optional (`pins.ts`, `server.ts` `readMark`, `dataset-api`). `markRef` checks the Volume is in the parish's church books, and the Image range only when an Image is given. A Mark with no Image saves a hand Reference pin with no Image or Box, and nothing else.
- Server: an endpoint for the Change Volume list: the parish's Volumes in the reference's Book series, grouped _Fits the reference_ / _Other Volumes_. `parishVolumes` in `locate.ts` is described as population-register Volumes; check whether it covers every series, and look up by series if it doesn't.
- Viewer state: a pending change for the current source (Volume, Image?, Box?), separate from the Link. Showing a pending Volume keeps the source and sets `away`.
- The bar: Was / Now, Cancel, Save. Save marks, then follows the new Link and reloads the Volume's citations, as `confirm` does. Cancel goes back to the Link.
- The leaving guard: every way out of the source asks Save / Discard / Keep editing in the bar.
- The toolbar's Volume name opens the Change Volume list.

## Tests

- pins/scans: a Mark without an Image resolves to Marked Volume, adds no Record pin and changes no ranges. It replaces an Image Mark in another Volume, and an Image Mark later replaces it.
- server: a Mark without an Image is accepted; an Image out of range is still refused.
- viewer state: a pending Volume sets `away`; Cancel restores the Link; leaving with changes pending is held until Save or Discard.
