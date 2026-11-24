import { css } from 'lit';

import { focusRingStyles } from '@/client/focus-ring';

// Over whatever it opens on: in the Scan viewer, over its Box and under
// nothing else.
const menu = css`
  :host {
    position: absolute;
    z-index: 3;
    display: flex;
    flex-direction: column;
    min-width: 12rem;
    padding: 0.3rem;
    border: 1px solid var(--raised-border);
    border-radius: 8px;
    background: var(--raised);
    box-shadow:
      0 10px 30px var(--shadow),
      0 2px 6px var(--shadow);
    font-size: 0.875rem;
    line-height: 1.4;
    cursor: auto;
  }

  h3 {
    margin: 0 0 0.3rem;
    padding: 0.2rem 0.5rem 0.4rem;
    overflow: hidden;
    border-bottom: 1px solid var(--raised-border);
    color: var(--muted);
    font-size: 0.8em;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    padding: 0.3rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .muted {
    color: var(--muted);
  }

  .before {
    margin-right: 0.3em;
  }

  /* As the person search shows years: a size down. */
  .after {
    margin-left: 0.4em;
    font-size: 0.85em;
  }

  .detail {
    display: block;
    font-size: 0.85em;
  }
`;

// An ask: its question wrapped to a dialog's width, its buttons drawn as a
// dialog's (dialog-styles.ts), side by side at the end.
const ask = css`
  :host([role='alertdialog']) {
    max-width: 22rem;
    padding: 0.9rem 1rem;
  }

  h2 {
    margin: 0 0 0.3rem;
    font-size: 1em;
  }

  p {
    margin: 0 0 0.9rem;
    color: var(--fg);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  button.act {
    padding: 0.35rem 0.9rem;
    border-color: var(--raised-border);
    text-align: center;
  }

  button.act:hover,
  button.act:focus-visible {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  button.danger,
  button.danger:hover,
  button.danger:focus-visible {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--on-danger);
  }

  button.primary,
  button.primary:hover,
  button.primary:focus-visible {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
`;

export const contextMenuStyles = [focusRingStyles, menu, ask];
