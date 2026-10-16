Status: ready-for-agent

# Boxes around entries on the scan

Part of `../spec.md`. Needs 02.

## What

- Rows on the shown Image with a `Box` get a box drawn over the scan, placed
  by the Box's fractions of the Image's width and height, and moved with the
  same transform as the full Image (`layers` in `frame.ts`), so it follows
  zoom, pan and pinch.
- Hovering a box highlights its row, and hovering a row highlights its box.
  Clicking a box does what clicking its row does.
- People sharing a record share one box, with their rows highlighted
  together.
- Boxes show only once the full Image is shown, not over the blurred
  thumbnail.
- A drag or a pinch that starts on a box still pans and zooms the scan.

## Done when

- The placement maths (Box fractions to the shown frame) is a pure helper
  tested beside `frame.test.ts`.
- On a Volume with vision matches, boxes sit on their entries at any zoom,
  and hovering a row picks out its box.

## Comments

Landed as `sl-scan-entries` (`scan-viewer/entries.ts`), an overlay on the
stage. Boxes are placed in stage pixels by `boxOnStage` rather than
transformed with the Image, so their outline keeps one width at any zoom;
`entriesShown` holds them back until the full Image is shown. Rows sharing a
Box are one entry (`entriesOn`, keyed by `boxKey`), and clicking it picks its
first row. Presses bubble to the stage, so drags and pinches still pan and
zoom; a press that moves past the viewer's drag threshold isn't a click. The
viewer's loaders share a `Latest` request helper, and its loading note moved
to `note.ts`, to keep it under the line limit.
