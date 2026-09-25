// The viewer's appearance choice: 'system' follows the OS, 'light' / 'dark' pin
// it. Pinned, it sits on <html data-theme>, which sets `color-scheme` and so
// every `light-dark()` colour token (styles.css).
//
// It's kept in a cookie rather than localStorage: the app's server takes a new
// port each launch, which makes a new origin — and origin-keyed storage — each
// time, while cookies are scoped by host alone. The inline script in index.html
// reads the same cookie before first paint, so the page never flashes the
// other theme.

export type Appearance = 'system' | 'light' | 'dark';

const COOKIE = 'sl-appearance';
const YEAR_S = 365 * 24 * 60 * 60;
const CYCLE: readonly Appearance[] = ['system', 'light', 'dark'];

export function currentAppearance(): Appearance {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

export function setAppearance(appearance: Appearance) {
  const root = document.documentElement;
  if (appearance === 'system') {
    delete root.dataset.theme;
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.dataset.theme = appearance;
    document.cookie = `${COOKIE}=${appearance}; path=/; max-age=${YEAR_S}; samesite=lax`;
  }
}

export function nextAppearance(appearance: Appearance) {
  return CYCLE[(CYCLE.indexOf(appearance) + 1) % CYCLE.length]!;
}
