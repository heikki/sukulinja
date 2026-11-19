// The corner lists' popover's size, as it was last dragged to. Kept in a
// cookie for the reason appearance.ts gives: the app's origin changes
// every launch, and cookies are scoped by host alone.

export interface PanelSize {
  width: number;
  height: number;
}

const COOKIE = 'sl-corner-size';
const YEAR_S = 365 * 24 * 60 * 60;

export const DEFAULT_SIZE: PanelSize = { width: 576, height: 576 };
const MIN: PanelSize = { width: 320, height: 280 };

// The size within what fits: at least the smallest, at most the window
// leaves room for beside and under the corner.
export function fitted(size: PanelSize, room: PanelSize): PanelSize {
  return {
    width: Math.round(
      Math.max(MIN.width, Math.min(size.width, room.width - 32))
    ),
    height: Math.round(
      Math.max(MIN.height, Math.min(size.height, room.height - 80))
    )
  };
}

// "512x576" as a size; null for anything else.
export function readSize(raw: string | undefined): PanelSize | null {
  const m = /^(?<w>\d+)x(?<h>\d+)$/u.exec(raw ?? '');
  if (m?.groups === undefined) return null;
  return { width: Number(m.groups.w), height: Number(m.groups.h) };
}

export function panelSize(): PanelSize {
  const prefix = `${COOKIE}=`;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
  return readSize(raw) ?? DEFAULT_SIZE;
}

export function setPanelSize(size: PanelSize) {
  document.cookie = `${COOKIE}=${size.width}x${size.height}; path=/; max-age=${YEAR_S}; samesite=lax`;
}
