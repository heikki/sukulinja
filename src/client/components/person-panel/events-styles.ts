import { css } from 'lit';

// Events: each Fact a row across the panel's width, tinted as clicking
// opens it for editing, its kind in a column of its own; and below them a
// button to add one.
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

// A Fact's form: its fields labelled on the left, the buttons at the end.
export const factFormStyles = css`
  :host {
    display: block;
  }

  .form {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }

  label {
    display: grid;
    grid-template-columns: 5.75rem 1fr;
    align-items: center;
    gap: 0.5rem;
  }

  label span {
    color: var(--muted);
  }

  input,
  select {
    min-width: 0;
    box-sizing: border-box;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--fg);
    font: inherit;
  }

  .buttons {
    display: flex;
    gap: 0.25rem;
    margin: 0.15rem -0.4rem -0.2rem;
  }

  .buttons.end {
    justify-content: flex-end;
  }

  .gap {
    flex: 1;
  }

  .buttons button {
    padding: 0.15rem 0.5rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }

  .buttons button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  .buttons button.primary {
    color: var(--accent);
  }

  .buttons button.primary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--on-accent);
  }

  .buttons button.danger {
    color: var(--danger);
  }

  .buttons button.danger:hover:not(:disabled) {
    background: var(--danger);
    color: var(--on-accent);
  }

  p {
    margin: 0;
  }

  p.error {
    color: var(--danger);
    font-size: 0.85rem;
  }
`;
