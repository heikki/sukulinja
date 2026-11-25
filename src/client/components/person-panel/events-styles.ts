import { css } from 'lit';

// Events: each Fact a row across the panel's width, tinted when pointed at
// and more while its menu is open, its kind in a column of its own; and
// below them a button to add one. Its menu is fixed in the window, so the
// panel's scrolling doesn't clip it.
export const personEventsStyles = css`
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 0.75rem;
  }

  button.fact {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    margin: 0 -1.1rem;
    padding: 0.1rem 1.1rem;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button.fact:hover {
    background: color-mix(in srgb, var(--accent) 7%, var(--card));
  }

  button.fact.menued {
    background: color-mix(in srgb, var(--accent) 14%, var(--card));
  }

  button.fact:focus-visible {
    outline-offset: -2px;
  }

  .kind {
    color: var(--muted);
  }

  .text {
    overflow-wrap: anywhere;
  }

  /* No source supports it yet. */
  .unsourced .text {
    color: var(--muted);
  }

  sl-context-menu {
    position: fixed;
  }

  sl-fact-form {
    grid-column: 1 / -1;
    margin: 0.35rem 0;
  }

  button.add {
    margin-top: 0.35rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }

  .facts:empty + button.add {
    margin-top: 0;
  }

  button.add:hover {
    color: var(--accent);
    text-decoration: underline;
  }
`;
