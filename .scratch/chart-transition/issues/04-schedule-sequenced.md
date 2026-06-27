Status: ready-for-human

# Schedule seam + sequenced choreography

## Parent

`.scratch/chart-transition/PRD.md`

## What to build

Introduce the **Schedule** — the single, swappable policy that assigns each
**Transition** phase its delay, duration, and easing — and have **Apply** consume
it instead of running every phase at offset 0.

Ship the concurrent Schedule as the default (reproducing today's timing exactly),
then add a sequenced Schedule that staggers **Leave → Move → Enter**, selectable.
A human reviews and tunes the staggered timing by eye — this is the "fade out →
animate → fade in" choreography, and the feel is the point.

Once the seam exists (two real adapters: concurrent + sequenced), add an ADR
recording why the **Planner** (*what* moves) and the **Schedule** (*when*) are
separate concerns.

This slice is HITL: the staggered timing/easing needs a human to judge the feel,
not just a passing test.

## Acceptance criteria

- [ ] Apply runs all phases through a Schedule; the concurrent Schedule
      reproduces today's timing exactly.
- [ ] A sequenced Schedule staggers Leave → Move → Enter and can be selected.
- [ ] The staggered choreography is reviewed by a human and the timing/easing
      tuned to feel right.
- [ ] An ADR records the Planner / Schedule split.
- [ ] `bun run` format → lint → typecheck → tests all pass.

## Blocked by

- `.scratch/chart-transition/issues/03-leave-phase.md`
