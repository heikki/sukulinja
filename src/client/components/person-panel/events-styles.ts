import { css } from 'lit';

// Events: each Fact a row across the panel's width, tinted as clicking
// opens it for editing, its kind in a column of its own, its sources under
// its text; and below them a button to add one.
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

  button.fact:focus-visible {
    outline-offset: -2px;
  }

  .kind {
    color: var(--muted);
  }

  .text {
    overflow-wrap: anywhere;
  }

  /* A Fact's sources, under its text, quiet until pointed at. */
  ul.sources {
    grid-column: 2;
    margin: 0 0 0.15rem;
    padding: 0;
    list-style: none;
  }

  button.source {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  button.source::before {
    content: '↳ ';
  }

  button.source:hover {
    color: var(--accent);
    text-decoration: underline;
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
