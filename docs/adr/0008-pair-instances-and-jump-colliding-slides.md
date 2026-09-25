# Pair Transition instances one-to-one, and let colliding slides jump

A Focus **Relayout** re-roots the chart, so the **Transition** can only match survivors by personId / base key. The first **Planner** keyed its capture on that identity alone, which broke wherever a person or **Family** is drawn more than once (pedigree collapse, or one person in two roles — say a step-spouse at **Parent row** who is also an **Aunt/Uncle**): the last copy won the lookup, every new copy slid out of that one spot, and a surplus old copy vanished without a Ghost because its identity "survived". Edges and boxes each picked their copy independently, so a line could slide one way while its card went another. Separately, re-rooting can move cards to the other side of a neighbour — **Aunts/Uncles** switch sides of their bloodline sibling as Focus steps a generation up or down — and a straight slide drove them through the cards in between.

Decision: the Planner builds one plan per Relayout that puts every box and edge in exactly one phase.

- **Pairing** is one-to-one within a match key (the **Box key** on a Generation Relayout, personId / base key on a Focus Relayout), nearest on screen first. Unpaired copies enter or leave.
- A pair whose slide would pass through another sliding card **Jumps** — leaves as a Ghost, re-enters at its new spot. All slides share one easing, so two cards' separation moves in a straight line and the test is a segment-against-overlap-box check. Conflicts resolve farthest-traveller-first, so short local slides keep moving and the long side-switches jump.
- A line slides only if every box it connects slides — its old copy's boxes pairing onto its new copy's (emit records them as `attach`). A **Tie** connects its spouses; a **Sibship connector** (Drop, Bar and Legs as one path) connects the parents and every kid. So when any part of the tree jumps, enters or leaves, the lines connecting it fade out and back in with it, rather than sliding with a loose end or stretching toward a card that isn't there yet.

Enter is decided with the rest of the plan, at settle, by instance key, rather than by an identity diff at render. Settle runs in the same microtask chain as the relayout's renders, so the flags land before the first paint.

## Considered options

- **Keep identity matching, fix up duplicates.** Rejected: any rule that folds copies to one identity has to guess which copy moved, and Enter/Leave, computed separately, disagreed with the Move about the same items.
- **Structural pairing** (match copies by their role path from Focus). Rejected: a role can change across a re-root (step-spouse becomes aunt), and the case that matters visually is the short slide, which nearest-on-screen picks directly.
- **Slide everything, reorder paint so movers pass behind.** Already done for stationary cards, but when both cards move there is no "behind", and a pile-up of cards mid-flight still reads as a glitch.
- **Curved paths around obstacles.** Rejected as far heavier than the problem; a jump reads cleanly with the existing out → move → in stagger.

## Consequences

- The plan's `pairs` (old key → new key) let an Enter fade still running from a rapid previous Relayout follow its card rather than snapping to full opacity.
- Generation Relayouts are rooted and never re-order a row: a sweep of every focus in the Bourbon sample at 1↔2↔3↔5 levels produced no jumps, so level changes slide exactly as before.
