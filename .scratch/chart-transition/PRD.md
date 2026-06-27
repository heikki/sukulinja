# Deepen the Hourglass-chart Transition into a TransitionController

_Design captured from an `/improve-codebase-architecture` grilling session. Vocabulary: see the **Transition** section of `CONTEXT.md` (Relayout, Transition, Move/Enter/Leave, Pin, Box key, Schedule, Ghost)._

## Problem

The Move + Enter animation landed this session but lives scattered across the
tree-view element — ~13 private fields plus rules threaded through `willUpdate`,
`updated`, `refreshEntering`, and the box sort in `render`. The whole class of
bugs we hit (fade scope, FLIP flash, pedigree-collapse mis-keying, clipping,
z-order) lived in the *interactions* between those scattered pieces, which is
exactly where there is no locality. Animating between two charts is one coherent
behaviour with no module of its own, and none of it is tested.

## Shape (grilled)

A **TransitionController** — a Lit ReactiveController, sibling to
`ViewportController` — owns capture / plan / apply / timers / cancellation /
paint-order. Four parts behind it:

- **Planner** (pure, the tested core): `prev chart + next chart + Relayout kind +
  chart→screen mapping → plan { leaving, moving (from→to screen), entering }`,
  keyed by **Box key** (path) for a **Generation limit** Relayout and by
  personId / base key for a **Focus** Relayout (so pedigree-collapse duplicates
  match correctly). Knows *what*, never *when*.
- **Schedule** (swappable policy): each phase's delay / duration / easing.
  Concurrent today; sequenced later.
- **Apply** (thin DOM adapter): runs plan × Schedule via Web Animations + the
  `d`-morph. The impure edge, kept thin so the Planner stays pure.
- **Ghost layer**: the element renders the `leaving` list as faded,
  non-interactive copies; the controller retains the previous chart and clears
  the list on fade-finish.

The **element keeps only**: feed the next chart; the 3-line **Pin** handshake in
`updated()` (`applyPendingPin()` then `transition.settle()`); read back box
paint-order + entering / ghost lists for render.

## Decisions

- Controller-owned coordination (ReactiveController), pure Planner internal seam.
- The element sequences the Pin (the Pin is the viewport's; the element composes
  the two controllers). The Transition never owns the Pin (ADR-0004).
- Own exit via a ghost re-render layer (Leave fades out, doesn't snap).
- Phases + Schedule as a *real* seam (two adapters: concurrent, sequenced).
- Consumes the flat `EmitOutput`, never the layout tree (ADR-0003).

## Test surface

Feed two charts + a fake chart→screen mapping → assert `plan.leaving`,
`plan.moving` (from→to), `plan.entering`, and the box paint-order. No Lit, no DOM
— none of which is testable today.

## Slices

1. `01-move-phase` — Move into the TransitionController + Planner (AFK)
2. `02-enter-phase` — fold Enter in (AFK)
3. `03-leave-phase` — add the Leave phase, ghost fade-out (AFK)
4. `04-schedule-sequenced` — Schedule seam + sequenced choreography (HITL)
