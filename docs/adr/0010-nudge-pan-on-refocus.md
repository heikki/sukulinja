# Nudge the pan on refocus so the new chart stays in view

The **Pin** keeps **Focus** at the screen pixel the viewer clicked, which makes the **Move** coherent but knows nothing about the new chart's extent: clicking a box near an edge leaves most of the new **Hourglass chart** off-screen. After a Focus **Relayout**, the viewport now applies a **Nudge** on top of the Pin — the smallest pan that brings the **Comfort region** (Focus row plus Parent row) inside the canvas, padded by the existing fit margin.

The Nudge is a pure function of the post-Pin transform, the region in chart coordinates, and the canvas size (`viewport/transform.ts`, unit-tested beside the other transform helpers); `tree-view` derives the region from the emitted boxes and hands it down, so the viewport stays ignorant of chart structure. It is folded into the same pan that `applyPendingPin` computes, before `settle()` plays the **Move**. The Move is a screen-space FLIP from each card's old spot to its new one, so survivors' slides already carry the camera shift on the one Move timeline — no separate camera animation, and cards and edges stay frame-locked (ADR-0009).

Rules:

- **Pan only.** Zoom is never touched. If the region overflows an axis, Focus's column is centred on that axis and the extremes clip.
- **Focus changes only.** A **Generation limit** change keeps its silent pin; the view must not shift under the slider.
- **A pan restored from the URL wins.** Back/Forward and shared links land exactly the stored pan (ADR-0004); the Nudge runs only when none is pending.
- **Zero nudge is a no-op.** No extra pan and no extra settle.
- **Same URL path as the Pin.** The nudged pan is written by the Pin's `onSettle` follow-up `replaceState`, so the push-then-replace flow and one-entry-per-click history are unchanged.
- **Timing is the Schedule's, unchanged.** The Move keeps its fixed duration, so a large Nudge makes survivors travel faster over the same time.

## Considered options

- **Always recenter on the new Focus.** Rejected: every click moves the clicked box, even when the chart already fits, so stable clicks are lost.
- **Fit the whole chart (`fitTo`).** Rejected: changes zoom, which is the viewer's.
- **A real camera animation** (pan eases on the pan layer while cards slide in chart space). Rejected: needs a second timeline, a chart-space Move, and a deferred URL write, for the same look the folded-in shift already gives; two clocks risk the chart swimming under the cards.
- **Nudge after the Move lands.** Rejected: leaves the chart stranded for the whole slide, and the correction reads as a second, separate motion.
- **Pin only (status quo).** Rejected: strands the new chart off-screen after edge clicks.

## Consequences

- **Focus** is held still during the Move only when the Nudge is zero. The Pin's guarantee is now "unless the chart would not fit".
- A long Nudge shortens the slide's apparent duration. If it feels rushed, scale the Move's duration with survivor travel in the Schedule; nothing else changes.
- The Comfort region's definition lives with `tree-view`, not the viewport, so adjusting what must stay visible (e.g. include nearby descendants) is a one-place change.
