Status: ready-for-agent

# Fold the Enter phase into the TransitionController

## Parent

`.scratch/chart-transition/PRD.md`

## What to build

Move the **Enter** phase — the fade-in of boxes and edges new to the next chart
— into the **TransitionController** and **Planner**, so the controller owns both
**Move** and **Enter**.

The Planner's plan gains an `entering` set: boxes new by personId, edges new by
base key (relayout-invariant, so a **Focus** **Relayout** marks only
genuinely-new people/families rather than fading the whole chart). The element
reads `entering` flags from the controller for render and sheds the enter-fade
fields and clear-timer it currently holds.

## Acceptance criteria

- [ ] New cards and edges fade in exactly as today on both Relayout kinds;
      persisting cards never fade.
- [ ] The element no longer holds the entering sets / clear timer; the
      controller owns them.
- [ ] Planner test extended to assert the `entering` set, including that a Focus
      Relayout marks only genuinely-new persons/families (not all of them).
- [ ] Reduced-motion still suppresses Enter.
- [ ] `bun run` format → lint → typecheck → tests all pass.

## Blocked by

- `.scratch/chart-transition/issues/01-move-phase.md`
