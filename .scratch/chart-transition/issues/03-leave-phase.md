Status: ready-for-agent

# Add the Leave phase (ghost fade-out)

## Parent

`.scratch/chart-transition/PRD.md`

## What to build

Add the **Leave** phase. Boxes and edges absent from the next chart currently
vanish instantly; fade them out as **Ghosts**.

The **Planner**'s plan gains a `leaving` set — departing items with their last
screen position. The **TransitionController** retains the previous chart and
exposes a `leaving` list the element renders into a separate, non-interactive
ghost layer, drawn through the normal box/edge rendering so ghosts look
identical to live cards, positioned at the last screen spot within the new
frame. The controller clears the list when the Leave fade finishes, and a
superseding **Relayout** cancels in-flight Leaves cleanly.

## Acceptance criteria

- [ ] A Relayout that drops items (decreasing the **Generation limit**, or a
      **Focus** change that drops laterals) fades the departing boxes/edges out
      instead of snapping them away.
- [ ] Ghosts are non-interactive, sit at their last screen position, and do not
      affect layout or the **Pin**.
- [ ] The ghost layer is emptied when the Leave fade finishes — no leaked DOM or
      animations after a Transition; a superseding Relayout cancels in-flight
      Leaves.
- [ ] Planner test extended to assert the `leaving` set for a relayout that drops
      boxes and edges.
- [ ] Reduced-motion removes departing items immediately (no fade).
- [ ] `bun run` format → lint → typecheck → tests all pass.

## Blocked by

- `.scratch/chart-transition/issues/02-enter-phase.md`
