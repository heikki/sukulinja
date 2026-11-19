import { html, svg } from 'lit';

// A magnifying glass in currentColor: inside the search field, and on the
// corner button that opens it.
export const SEARCH_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <circle
      cx="7"
      cy="7"
      r="4.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M10.5 10.5 14 14"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  `}
</svg>`;
