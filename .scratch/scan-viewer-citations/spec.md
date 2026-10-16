Status: ready-for-agent

# Citations on the Image in the Scan viewer

## Problem Statement

The Scan viewer opens on one Church-book reference: the citation I clicked. While I step through the Volume from there, it shows nothing else I know about the pages. A household spread may hold a dozen people from my tree, each already linked by a Seen record, a Placement or Anchors, but I only see that by going back to the tree and opening each person's sources one at a time.

So I can't tell, while browsing a book, whom on this page I've already connected, who in the household I haven't, or where a person I'm looking for sits relative to the ones I have.

## Solution

The Scan viewer shows every citation in the dataset that links to the Image on screen:

- **Placed** ones (Seen records and Placements, by hand or by the vision model) are known to be on this Image.
- **Anchored** and **Estimated** ones are shown as probably here, set apart from the Placed.
- Each names the person and the citation's Book and page, and opens that person in the tree.
- Where the entry's position on the Image is known, the person is marked on the scan itself: a box around their entry, or a pin, that follows zoom and pan.

Browsing a Volume then shows, page by page, everyone I've already tied to it.

## User Stories

1. As a researcher, I want to see which people in my tree are on the Image I'm looking at, so that I know whom I've already linked on this page.
2. As a researcher, I want Placed citations told apart from Anchored or Estimated ones, so that I know which are certain.
3. As a researcher, I want vision matches told apart from hand ones, as in the source panel, so that I know how much to trust them.
4. As a researcher, I want to open a person from that list in the tree, and have the viewer switch to their citation, so that I can go from a household on the page to the family in the chart and fix each member's link without leaving the scan.
5. As a researcher, I want each person's entry marked on the scan where its position is known, so that I can find them on a crowded spread at a glance.
6. As a researcher, I want the list to follow me as I step through the Volume, so that browsing a book shows what's on each page.
7. As a researcher, I want this to work in any Volume of the parish, not only the one the opened citation links, so that switching Volumes keeps showing what I know.
8. As a researcher, I want marking a citation's Image by hand to update the list at once, so that a correction shows where it landed.

## Implementation Decisions

**The Volume's citations.** A new query answers, for one Volume of a dataset, every church-book citation whose resolution lands in it, with its Image, Scan method and `by`. It reuses the existing resolution (`resolveChurchBookRef`) over the dataset's citations, so it agrees with the links the source panel shows. It is computed per Volume on demand and kept until a correction or a re-import changes it. The Scan viewer asks for it when a Volume opens and filters by the Image on screen.

- Only the citations whose parish is the Volume's are resolved: parsing is offline, but resolving a reference of another parish would crawl that parish's Volumes from Astia.
- One row per person and record. People citing the same record (a baptism cited by the child and both parents) each get a row, and share its Image and position.
- A **Split** reference appears in each of its candidate Volumes, marked as one of several.
- A reference resolved only to the **Volume** (no Image) is listed for the Volume as a whole, not on any Image.

**Entry positions.** A position is a `Box` on the Image in fractions of its width and height (so it survives the scan being shown at any size), stored with the Seen record or Placement it belongs to:

- The vision model reports it, and a vision match saves it. This landed with the vision pass (`saveVisionMatch`), so the first full pass collects them.
- A hand mark has no position. A hand correction replaces a vision entry whole, its position with it. Marking could later let me click the entry on the scan rather than just the Image, saving its position too.
- Anchored and Estimated citations have no position.

**In the Scan viewer.** A collapsible side panel in the viewer, beside the scan, grouped Placed, then probably here, then the Volume as a whole. Each row has the person's name, the citation's page, its method and `by`. Boxes on the scan for entries with a position, highlighted with their row on hover.

**Clicking a row** focuses that person in the chart and switches the viewer to their citation: the dock shows their sources with this one marked as viewed, and the toolbar's Mark applies to them. The viewer stays on the Image shown.

## Testing Decisions

- The Volume's citations: given a dataset's citations and anchors (fake Astia, as the image-cache and runner tests do), the query returns the Placed, Anchored and Estimated citations on each Image, Splits in each candidate Volume, and reflects a correction at once.
- Positions: a vision match saved with a box reads back with it; a hand correction of the same record replaces it (and its position) as provenance already decides.
- The list's grouping and labels as helpers beside the Scan viewer's, tested as `markOffer` and `linkLabel` are.

## Out of Scope

- Reading names off the scan for people not in the tree. Transcribing entries is a separate idea (see the vision spec's out of scope).
- Positions for Anchored or Estimated citations, or for hand marks made before click-to-mark exists.
- Editing positions by dragging boxes.

## Further Notes

- The dry run of the vision pass resolved all of one tree's ~2,400 church-book references in about two seconds with Astia's metadata cached, so resolving a Volume's citations on demand should be quick.
- The positions are cheapest to collect during the first full vision pass: every find-entry reading costs the same with or without a bounding box in its answer, and the pass will read some 2,400 confirmed entries.
