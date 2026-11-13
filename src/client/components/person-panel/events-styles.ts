import { css } from 'lit';

// Events: each Fact a row across the panel's width, tinted as clicking
// opens it for editing, its kind in a column of its own, its sources under
// its text while it's pointed at; and below them a button to add one.
export const personEventsStyles = css`
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 0.75rem;
  }

  .row {
    position: relative;
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
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

  /* A Fact's sources, floating under its text while it's pointed at or
     focused from the keyboard: over the Facts below rather than pushing
     them down, so nothing moves under the pointer. They show after a
     moment, so passing over the list doesn't flash them, and stay while
     the pointer moves onto them. */
  ul.sources {
    position: absolute;
    top: 100%;
    z-index: 1;
    grid-column: 2;
    margin: 0;
    padding: 0.3rem 0.5rem;
    list-style: none;
    border: 1px solid var(--card-border);
    border-radius: 6px;
    background: var(--card);
    box-shadow: 0 4px 12px var(--shadow);
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 0.1s,
      visibility 0s 0.1s;
  }

  .row:is(:hover, :has(:focus-visible)) ul.sources {
    visibility: visible;
    opacity: 1;
    transition:
      opacity 0.1s 0.35s,
      visibility 0s 0.35s;
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
