// Whether the Scan viewer shows the page an Image is counted as (ADR-0032):
// off unless picked in Settings, for checking a page survey by stepping
// through a Volume. Kept in a cookie for the reason appearance.ts gives.

import { signal } from '@lit-labs/signals';

const COOKIE = 'sl-page-numbers';
const YEAR_S = 365 * 24 * 60 * 60;

function fromCookie() {
  return document.cookie.split('; ').includes(`${COOKIE}=on`);
}

export const pageNumbersOn = signal(fromCookie());

export function setPageNumbersOn(on: boolean) {
  document.cookie = on
    ? `${COOKIE}=on; path=/; max-age=${YEAR_S}; samesite=lax`
    : `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  pageNumbersOn.set(on);
}
