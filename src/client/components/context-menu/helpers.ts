import type { Point } from '@/client/pan-zoom';

// Where a pop-up at `at` in the element it's positioned in goes: moved in
// from any edge it would cross; one fixed in the window, from the window's.
export function placedInside(el: HTMLElement, at: Point) {
  const fixed = getComputedStyle(el).position === 'fixed';
  const window_ = { width: window.innerWidth, height: window.innerHeight };
  const box = fixed ? window_ : el.offsetParent?.getBoundingClientRect();
  if (box === undefined) return at;
  const x = Math.min(at.x, box.width - el.offsetWidth - 4);
  const y = Math.min(at.y, box.height - el.offsetHeight - 4);
  return { x: Math.max(4, x), y: Math.max(4, y) };
}
