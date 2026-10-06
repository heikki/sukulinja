// The Schedule is the Transition's timing policy — the only place *when* lives.
// The Move is an eased slide whose length scales with travel; Leave/Enter are CSS fades the element
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
const MOVE_DELAY = 120;
const ENTER_DURATION = 220;

// The slide's length grows with how far the farthest survivor travels (screen
// px), so a long Move reads as a glide rather than a snap: a floor for short
// hops, a linear ramp, then a cap so a cross-chart jump stays brisk.
const MOVE_MIN_MS = 320;
const MOVE_MAX_MS = 600;
const MOVE_BASE_MS = 200;
const MOVE_MS_PER_PX = 0.5;

function moveDuration(travelPx: number) {
  const ms = MOVE_BASE_MS + travelPx * MOVE_MS_PER_PX;
  return Math.min(MOVE_MAX_MS, Math.max(MOVE_MIN_MS, ms));
}

// Staggered "fade out → slide → fade in": ghosts leave, then survivors slide,
// then newcomers arrive. The Enter fade waits out the whole Move (delay +
// duration) before it starts — a plain CSS animation-delay — so newcomers appear
// only once the slide has landed, however long it runs. The Move outlasts the
// Leave fade, so the ghosts clear first too.
export function transitionSchedule(travelPx: number): Schedule {
  const move: PhaseTiming = {
    delay: MOVE_DELAY,
    duration: moveDuration(travelPx),
    easing: MOVE_EASING
  };
  return {
    leave: LEAVE,
    move,
    enter: {
      delay: move.delay + move.duration,
      duration: ENTER_DURATION,
      easing: FADE_IN_EASING
    }
  };
}
