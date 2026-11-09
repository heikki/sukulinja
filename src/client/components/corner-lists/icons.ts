import { html, svg } from 'lit';

// The corner buttons' icons, in currentColor like the gear beside them.

// A flag on its pole: the Reminders.
export const FLAG_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 4 14.5 V 2 M 4 2.75 H 12.5 L 10.75 5.5 L 12.5 8.25 H 4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `}
</svg>`;

// A clock face: the Changes.
export const CLOCK_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <circle
      cx="8"
      cy="8"
      r="6.25"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M 8 4.5 V 8 L 10.5 9.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `}
</svg>`;

// An open book: the Church books.
export const BOOK_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 8 4 C 6.5 2.75 4.25 2.5 1.75 2.75 V 13 C 4.25 12.75 6.5 13 8 14.25 C 9.5 13 11.75 12.75 14.25 13 V 2.75 C 11.75 2.5 9.5 2.75 8 4 Z M 8 4 V 14.25"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
  `}
</svg>`;
