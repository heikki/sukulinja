// Where the entry card goes beside its Box, kept on the stage: to the
// Box's right, or its left when it won't fit there, held inside the
// stage's edges and above its foot bar, its arrow pointing at the Box's middle as near as the
// card's height lets it. In stage pixels.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// How far down the card its arrow points when nothing moves it.
export const ARROW_AT = 18;
const GAP = 14;
const MARGIN = 8;
// The foot bar sits over the stage's bottom.
const FOOT = 76;
// The arrow stays this far from the card's corners.
const ARROW_INSET = 14;

function clamp(n: number, low: number, high: number) {
  return Math.max(low, Math.min(n, Math.max(low, high)));
}

export function placeCard(
  box: Rect,
  card: { width: number; height: number },
  stage: { width: number; height: number }
) {
  const right = box.left + box.width + GAP;
  const leftOf = box.left - GAP - card.width;
  const side =
    right + card.width <= stage.width - MARGIN || leftOf < MARGIN
      ? 'right'
      : 'left';
  const left = clamp(
    side === 'right' ? right : leftOf,
    MARGIN,
    stage.width - MARGIN - card.width
  );
  const middle = box.top + box.height / 2;
  const top = clamp(
    middle - ARROW_AT,
    MARGIN,
    stage.height - FOOT - card.height
  );
  const arrow = clamp(middle - top, ARROW_INSET, card.height - ARROW_INSET);
  return { left, top, side, arrow } as const;
}
