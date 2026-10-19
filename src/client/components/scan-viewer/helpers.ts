import type { Point } from '@client/pan-zoom';

// The Images beside `n` that exist, the one ahead of `step` first.
export function neighbours(n: number, count: number | null, step: 1 | -1) {
  const beside = [n + step, n - step];
  return beside.filter((i) => i >= 1 && (count === null || i <= count));
}

// Where a pop-up at `at` in its parent goes: moved in from any edge it
// would cross.
export function placedInside(el: HTMLElement, at: Point) {
  const box = el.parentElement?.getBoundingClientRect();
  if (box === undefined) return at;
  const x = Math.min(at.x, box.width - el.offsetWidth - 4);
  const y = Math.min(at.y, box.height - el.offsetHeight - 4);
  return { x: Math.max(4, x), y: Math.max(4, y) };
}
