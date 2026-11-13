// Whether the Assistant is turned on: off unless picked in Settings, while
// it's still being tried out. Off, there's no Assistant tab and no key row.
// Kept in a cookie for the reason appearance.ts gives.

import { signal } from '@lit-labs/signals';

const COOKIE = 'sl-assistant';
const YEAR_S = 365 * 24 * 60 * 60;

function fromCookie() {
  return document.cookie.split('; ').includes(`${COOKIE}=on`);
}

export const assistantOn = signal(fromCookie());

export function setAssistantOn(on: boolean) {
  document.cookie = on
    ? `${COOKIE}=on; path=/; max-age=${YEAR_S}; samesite=lax`
    : `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  assistantOn.set(on);
}
