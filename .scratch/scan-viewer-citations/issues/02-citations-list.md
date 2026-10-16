Status: ready-for-agent

# The list of people on the Image

Part of `../spec.md`. Needs 01.

## What

- The Scan viewer gets a collapsible side panel beside the scan. It fetches
  the Volume's citations (01) when a Volume opens or is switched to, and
  shows the rows for the Image on screen, following each step.
- Grouped:
  1. **Placed**, with vision matches told apart from hand ones as the
     source panel and toolbar already do;
  2. **Probably here**: Anchored and Estimated, a Split marked as one of
     several Volumes;
  3. **In this Volume**: rows with no Image.
- Each row: the person's name (from the tree view's loaded persons,
  `formatName`), the citation's page or reference, its method and `by`. The
  citation the viewer is on is marked.
- Clicking a row focuses that person in the chart (the tree view's
  `setFocus`) and switches the viewer to their citation: `scanOpen` becomes
  that row's `CitationRow` and its `Scan` on this Image. The dock then shows
  their sources with this one as viewed, and Mark applies to them. The
  viewer stays on the Image shown.
- A mark (`scan-marked`) refetches the Volume's citations, so the list shows
  where the correction landed.
- Grouping and labels are pure helpers in `scan-viewer/helpers.ts` (or a new
  file beside it), tested as `markOffer` and `linkLabel` are.

## Done when

- Stepping through a Volume shows each Image's people; switching Volumes
  shows the new Volume's.
- Clicking a household member moves the chart and the dock to them, and
  marking then saves for their citation.
- Marking an Image moves the row to the Placed group at once.
- The panel collapses and stays out of the scan's way.
