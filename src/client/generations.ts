// The viewer's Generations (the chart's Generation limit): a preference, not
// view state, so it stays out of the URL (ADR-0004). Any pick in Settings
// updates it. Kept in a cookie for the reason appearance.ts gives.

const DEFAULT_GENERATIONS = 2;
export const MAX_GENERATIONS = 5;

const COOKIE = 'sl-generations';
const YEAR_S = 365 * 24 * 60 * 60;

export function preferredGenerations() {
  const prefix = `${COOKIE}=`;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_GENERATIONS
    ? n
    : DEFAULT_GENERATIONS;
}

export function setPreferredGenerations(n: number) {
  document.cookie =
    n === DEFAULT_GENERATIONS
      ? `${COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${COOKIE}=${n}; path=/; max-age=${YEAR_S}; samesite=lax`;
}
