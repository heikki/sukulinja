Status: ready-for-agent

# Thumbnail placeholder and neighbour prefetch

Part of `../PRD.md`. Needs 02.

## What

- While the full Image loads, the viewer shows its 250px thumbnail scaled
  to the same frame and blurred, then swaps in the full Image without the
  view jumping.
- Once the shown Image has loaded, the Images on either side are
  prefetched. Stepping on aborts prefetches that are no longer neighbours,
  so 01's lane drops them.
- "Image unavailable" shows over the thumbnail when that is cached, or
  over an empty frame when it isn't.

## Done when

- Stepping to the next Image after a prefetch shows the full Image at once.
- Holding → through a Volume never leaves stale prefetches ahead of the
  Image on screen.
