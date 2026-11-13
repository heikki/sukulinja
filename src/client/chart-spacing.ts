// The chart's gaps and line offsets, in px, tunable in Settings for now while
// the right values are found; once they are, they become plain constants in
// tree-view/renderer.ts and this goes. Kept in a cookie for the reason
// appearance.ts gives.

import { signal } from '@lit-labs/signals';

export interface ChartSpacing {
  // Between two cards side by side, and between a Couple's two cards.
  gapX: number;
  coupleGap: number;
  // Between two rows of cards.
  gapY: number;
  // How far above the cards' bottom edge a Tie runs.
  tieLift: number;
  // How far a non-Primary spouse's Tie sits off the Primary one.
  tieOffset: number;
}

export const SPACING_DEFAULTS: Readonly<ChartSpacing> = {
  gapX: 22,
  coupleGap: 14,
  gapY: 60,
  tieLift: 30,
  tieOffset: 6
};

const COOKIE = 'sl-chart-spacing';
const YEAR_S = 365 * 24 * 60 * 60;

function fromCookie(): ChartSpacing {
  // Tests load the chart's paint code with no document.
  if (typeof document === 'undefined') return { ...SPACING_DEFAULTS };
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (raw === undefined) return { ...SPACING_DEFAULTS };
  try {
    const saved = JSON.parse(decodeURIComponent(raw)) as Partial<ChartSpacing>;
    const out = { ...SPACING_DEFAULTS };
    for (const key of Object.keys(out) as Array<keyof ChartSpacing>) {
      const v = saved[key];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    }
    return out;
  } catch {
    return { ...SPACING_DEFAULTS };
  }
}

export const chartSpacing = signal(fromCookie());

export function setChartSpacing(spacing: ChartSpacing) {
  const value = encodeURIComponent(JSON.stringify(spacing));
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${YEAR_S}; samesite=lax`;
  chartSpacing.set(spacing);
}

export function resetChartSpacing() {
  document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  chartSpacing.set({ ...SPACING_DEFAULTS });
}
