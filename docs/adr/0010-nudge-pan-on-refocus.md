# Nudge the pan on refocus so the new chart stays in view

The **Pin** keeps **Focus** at the screen pixel the viewer clicked, which makes the **Move** coherent but knows nothing about the new chart's extent: clicking a box near an edge leaves most of the new **Hourglass chart** off-screen. After a Focus **Relayout**, the viewport now applies a **Nudge** on top of the Pin. It works per axis, from the **Comfort region** (Focus row plus Parent row) and the whole chart's extents, against the canvas padded by the existing fit margin:

- **Chart fits the canvas:** untouched if nothing clips; if an edge clips, the whole chart is centred.
- **Chart too large:** the Comfort region is centred if it clips (Focus's column, if the region itself is too large). Then the chart is pulled so its edge never leaves empty canvas on one side while the other side is clipped — a Focus with nothing below it sits near the bottom with its ancestors showing above, rather than at the top with a blank half-screen below.

The Nudge is a pure function of the post-Pin transform, the region in chart coordinates, and the canvas size (`viewport/transform.ts`, unit-tested beside the other transform helpers); `tree-view` derives the region from the emitted boxes and hands it down, so the viewport stays ignorant of chart structure. It is folded into the same pan that `applyPendingPin` computes, before `settle()` plays the **Move**. The Move is a screen-space FLIP from each card's old spot to its new one, so survivors' slides already carry the camera shift on the one Move timeline — no separate camera animation, and cards and edges stay frame-locked (ADR-0009).

Rules:

- **Pan only.** Zoom is never touched. If the region overflows an axis, Focus's column is centred on that axis and the extremes clip — but the **Core** is pulled back inside the margins first when it fits — Focus, their spouses and all descendants, falling back to Focus and spouses alone — so the clip lands on siblings and the Parent row rather than on a spouse or a child's branch. Without this a Focus row thousands of px wide, with a spouse a few hundred px to one side, centred Focus and pushed that spouse off screen while the opposite side sat empty.
- **Focus changes and the first view only.** Opening a dataset centres Focus and then nudges the same way; a pan or zoom from the URL still wins there, and the initial pan is not written to the URL. A **Generation limit** change keeps its silent pin; the view must not shift under the slider.
- **A pan restored from the URL wins.** Back/Forward and shared links land exactly the stored pan (ADR-0004); the Nudge runs only when none is pending.
- **Zero nudge is a no-op.** An axis that fits is untouched, so a click that clips nothing moves nothing; no extra pan and no extra settle.
- **Same URL path as the Pin.** The nudged pan is written by the Pin's `onSettle` follow-up `replaceState`, so the push-then-replace flow and one-entry-per-click history are unchanged.
- **The Planner judges travel without the Nudge.** The Nudge shifts every card alike on screen, but ADR-0008 pairs repeated cards "nearest first" and lets the "farthest traveller" jump; both were measured in absolute screen px, which used to equal travel relative to the Pin's still card. The viewport now reports the Nudge's shift (read once per settle) and the Planner subtracts it from both, so a Nudge never changes which cards slide or jump. Without it the clicked card itself could fade out and back in, because its Nudge shift made it look like the farthest traveller.
- **Timing is the Schedule's.** The Move's duration scales with the farthest survivor's travel, which includes the Nudge, so a long Nudge glides instead of snapping.

## Considered options

- **Always recenter on the new Focus.** Rejected: every click moves the clicked box, even when the chart already fits, so stable clicks are lost.
- **Shift only until the clipped edge reaches the margin.** Rejected: it leaves the region hard against one edge with a wide empty band opposite; centring the clipped axis balances it.
- **Protect Focus and spouses only.** Rejected: it stopped as soon as a spouse touched the margin, leaving that marriage's children cut off while the opposite side sat empty; descendants are the next thing worth showing.
- **Centre Focus on an overflowing axis and stop.** Rejected: on a very wide row it clips a spouse as readily as a distant cousin, though the couple fits easily.
- **Consider the Comfort region alone.** Rejected: two rows nearly always fit, so nothing ran while the ancestors above were cut off and the canvas below Focus row sat empty. The whole chart's extents let the Nudge see both.
- **Fit the whole chart (`fitTo`).** Rejected: changes zoom, which is the viewer's.
- **A real camera animation** (pan eases on the pan layer while cards slide in chart space). Rejected: needs a second timeline, a chart-space Move, and a deferred URL write, for the same look the folded-in shift already gives; two clocks risk the chart swimming under the cards.
- **Nudge after the Move lands.** Rejected: leaves the chart stranded for the whole slide, and the correction reads as a second, separate motion.
- **Pin only (status quo).** Rejected: strands the new chart off-screen after edge clicks.

## Consequences

- **Focus** is held still during the Move only when the Nudge is zero. The Pin's guarantee is now "unless the chart would not fit".
- Centring makes the shift jump from zero to roughly half the slack as soon as an axis clips by even a pixel; the fit margin is the only threshold.
- The Comfort region's definition lives with `tree-view`, not the viewport, so adjusting what must stay visible (e.g. include nearby descendants) is a one-place change. The chart's extents come from the viewport's existing measurement port.
