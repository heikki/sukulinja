// Settings' rows: a muted label, then a choice of a few, as buttons side
// by side with the chosen one raised; a hint may go under one.

import { css, html } from 'lit';

export const rowStyles = css`
  .label {
    font-size: 0.85rem;
    color: var(--muted);
  }
  /* A note under a row's choice, such as what the model costs. */
  .hint {
    margin-top: -0.5rem;
    font-size: 0.75rem;
    color: var(--muted);
  }
  /* Equal segments, each as wide as the row's longest label; rows stretch
   to the widest so they line up as one column. */
  .segmented {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 2px;
    padding: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
  }
  .segmented button {
    min-width: 2rem;
    padding: 0.3rem 0.65rem;
    background: none;
    color: var(--muted);
    border: 0;
    border-radius: 5px;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .segmented button:hover {
    color: var(--accent);
  }
  /* Marked by colour and the raised fill, not weight: a bolder label would
   widen its column, and with it every segment and the popover. */
  .segmented button[aria-pressed='true'] {
    background: var(--card);
    color: var(--fg);
    box-shadow: 0 0 0 1px var(--border);
  }
`;

export interface Choice<T> {
  value: T;
  label: string;
}

// The choices, `current` raised; picking one calls `pick` with it.
export function segmented<T>(
  choices: ReadonlyArray<Choice<T>>,
  current: T,
  pick: (value: T) => void
) {
  return html`<div class="segmented">
    ${choices.map(
      ({ value, label }) => html`
        <button
          aria-pressed=${value === current}
          @click=${() => {
            pick(value);
          }}
        >
          ${label}
        </button>
      `
    )}
  </div>`;
}

export const OFF_ON: ReadonlyArray<Choice<boolean>> = [
  { value: false, label: 'Off' },
  { value: true, label: 'On' }
];
