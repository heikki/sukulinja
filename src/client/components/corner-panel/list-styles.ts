import { css } from 'lit';

import { focusRingStyles } from '@/client/focus-ring';

// What a corner panel's tab lists, in the shadow root of the element
// slotted in: rows that scroll between the panel's tabs and the list's
// actions, each a button with its text and what it's on, a note when
// there's nothing to list, and a link-like toggle under the list.
const list = css`
  :host {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }

  ul {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0 -0.75rem 1rem;
    padding: 0;
    list-style: none;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  button.row {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    width: 100%;
    padding: 0.45rem 0.75rem;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font-size: 0.9rem;
    text-align: left;
  }

  button.row:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  button.row:disabled {
    cursor: default;
  }

  button.row:disabled:hover {
    background: none;
  }

  button.row.done {
    opacity: 0.55;
  }

  .text {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .on {
    color: var(--muted);
    font-size: 0.85em;
  }

  .chip {
    margin-left: 0.4rem;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    font-size: 0.9em;
  }

  p.muted {
    margin: 0 0 1rem;
    color: var(--muted);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* A toggle under the list, such as showing the done ones. */
  button.toggle {
    margin-right: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 0.85rem;
  }

  button.toggle:hover {
    text-decoration: underline;
  }
`;

export const cornerListStyles = [focusRingStyles, list];
