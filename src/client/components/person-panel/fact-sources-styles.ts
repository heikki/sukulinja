import { css } from 'lit';

import { focusRingStyles } from '@/client/focus-ring';

// A picked Fact's sources: quiet text buttons, a size down, in the text's
// column when Events lays it on the Facts' columns; while edited, each with
// a checkbox before it.
export const factSourcesStyles = [
  focusRingStyles,
  css`
    :host {
      display: block;
      font-size: 0.85rem;
    }

    p,
    ul,
    .actions {
      grid-column: 2;
    }

    p,
    ul {
      justify-self: start;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .none {
      margin: 0;
      color: var(--muted);
    }

    button {
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    button:hover {
      text-decoration: underline;
    }

    button.source::before {
      content: '↳ ';
    }

    /* Edit event and the sources' list side by side. */
    .actions {
      display: flex;
      align-items: start;
      gap: 0.75rem;
      margin-top: 0.3rem;
    }

    .actions:first-child {
      margin-top: 0;
    }

    .actions button {
      color: var(--muted);
    }

    button.edit {
      flex: none;
      white-space: nowrap;
    }

    .actions button:hover,
    button.toggle[aria-expanded='true'] {
      color: var(--accent);
    }

    ul.editing {
      margin-top: 0.25rem;
    }

    ul.editing li {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      padding: 0.15rem 0;
    }

    input[type='checkbox'] {
      flex: none;
      width: 1rem;
      height: 1rem;
      margin: 0.1rem 0 0;
      accent-color: var(--accent);
      cursor: pointer;
    }

    input[type='checkbox']:disabled {
      cursor: default;
    }

    button.name {
      color: var(--fg);
    }

    button.name:hover {
      color: var(--accent);
    }

    .error {
      margin: 0.3rem 0 0;
      color: var(--danger);
    }
  `
];
