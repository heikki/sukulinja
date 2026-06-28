// The Schedule is the Transition's timing policy — the only place *when* lives.
// The Move is a fixed-duration eased slide; Leave/Enter are CSS fades the element
// drives from these values via custom properties. Separate from the Planner's
// *what* (ADR-0006), so the choreography retunes here without touching geometry.

export interface PhaseTiming {
  delay: number; // ms before the phase starts
  duration: number; // ms the phase runs
  easing: string; // any CSS <easing-function>
}

export interface Schedule {
  leave: PhaseTiming;
  move: PhaseTiming;
  enter: PhaseTiming;
}

const FADE_IN_EASING = 'ease-out';
const FADE_OUT_EASING = 'ease-in';
// A snappy, decelerating slide with no overshoot.
const MOVE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

const LEAVE: PhaseTiming = { delay: 0, duration: 180, easing: FADE_OUT_EASING };
const MOVE: PhaseTiming = { delay: 120, duration: 320, easing: MOVE_EASING };

// Staggered "fade out → slide → fade in": ghosts leave, then survivors slide,
// then newcomers arrive. The Enter fade waits out the whole Move (delay +
// duration) before it starts — a plain CSS animation-delay — so newcomers appear
// only once the slide has landed. The Move outlasts the Leave fade, so the
// ghosts clear first too.
export const transitionSchedule: Schedule = {
  leave: LEAVE,
  move: MOVE,
  enter: {
    delay: MOVE.delay + MOVE.duration,
    duration: 220,
    easing: FADE_IN_EASING
  }
};
