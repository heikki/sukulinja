import type { Point } from '@/client/pan-zoom';

// A rectangle in the window.
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function windowBox(): Box {
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight
  };
}

// The element `el` is positioned in; null for one fixed in the window.
export function positionedIn(el: HTMLElement): Element | null {
  if (getComputedStyle(el).position === 'fixed') return null;
  return el.offsetParent;
}

// Where `inside` is in the window now: the window itself for null.
export function boxOf(inside: Element | null): Box {
  return inside?.getBoundingClientRect() ?? windowBox();
}

// Where `el`, at `at` in `box`, goes in the window: moved in from any edge
// of `box` it would cross.
export function keptInside(el: HTMLElement, box: Box, at: Point): Point {
  const x = Math.min(at.x, box.width - el.offsetWidth - 4);
  const y = Math.min(at.y, box.height - el.offsetHeight - 4);
  return { x: box.left + Math.max(4, x), y: box.top + Math.max(4, y) };
}
