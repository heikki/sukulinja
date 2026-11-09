import { html, svg } from 'lit';

// The lists button's icon, in currentColor like the gear beside it: a
// short list, each line ticked off by a dot.
export const LISTS_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 6 4 H 14 M 6 8 H 14 M 6 12 H 14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <circle cx="2.75" cy="4" r="1" fill="currentColor" />
    <circle cx="2.75" cy="8" r="1" fill="currentColor" />
    <circle cx="2.75" cy="12" r="1" fill="currentColor" />
  `}
</svg>`;
