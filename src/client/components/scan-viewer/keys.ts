// The Scan viewer's keys, and where its page nav's buttons go.

import { clampImage } from '@/client/state/viewer';

// A move through the Volume's Images: a step of so many, or to either end.
export type ImageMove = -10 | -1 | 1 | 10 | 'first' | 'last';

interface Step {
  image?: ImageMove;
  source?: 1 | -1;
}

// ←/→ step through the Volume's Images, Shift for ten at a time, and
// Home/End (Fn+←/→) go to its ends; ↑/↓ step through the person's sources.
const STEPS: Record<string, Step> = {
  ArrowLeft: { image: -1 },
  ArrowRight: { image: 1 },
  Home: { image: 'first' },
  End: { image: 'last' },
  ArrowUp: { source: -1 },
  ArrowDown: { source: 1 }
};

const SHIFTED: Record<string, Step> = {
  ArrowLeft: { image: -10 },
  ArrowRight: { image: 10 }
};

// What a key press steps, if it steps anything: none while typing, in the
// Image number or anywhere else, or choosing in a list.
export function stepOf(e: KeyboardEvent) {
  const on = e.composedPath()[0];
  const typing =
    on instanceof HTMLInputElement ||
    on instanceof HTMLTextAreaElement ||
    on instanceof HTMLSelectElement ||
    (on instanceof HTMLElement && on.isContentEditable);
  if (typing) return null;
  return (e.shiftKey ? SHIFTED[e.key] : undefined) ?? STEPS[e.key] ?? null;
}

// The Image a move from `image` lands on, or null where it goes nowhere: at
// the end it would go to, or to the last Image before Astia gives the count.
// A step of ten stops at either end rather than going nowhere.
export function imageAfter(
  move: ImageMove,
  image: number,
  count: number | null
) {
  const to =
    move === 'first'
      ? 1
      : move === 'last'
        ? count
        : clampImage(image + move, count);
  return to === image ? null : to;
}
