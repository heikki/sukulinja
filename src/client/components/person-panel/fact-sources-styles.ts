import { css } from 'lit';

import { focusRingStyles } from '@/client/focus-ring';

// A picked Fact's sources: quiet text buttons, a size down, in the text's
// column when Events lays it on the Facts' columns.
export const factSourcesStyles = [
  focusRingStyles,
  css`
    :host {
      display: block;
      font-size: 0.85rem;
    }

    p,
    ul,
    button.add {
      grid-column: 2;
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

    button:hover:not(:disabled) {
      text-decoration: underline;
    }

    button:disabled {
      cursor: default;
    }

    button.source::before {
      content: '↳ ';
    }

    /* A long source's name is cut rather than spilling out of Events. */
    sl-context-menu {
      max-width: 100%;
      box-sizing: border-box;
    }

    button.add {
      grid-column: 2;
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

    button:hover:not(:disabled) {
      text-decoration: underline;
    }

    button:disabled {
      cursor: default;
    }

    button.source::before {
      content: '↳ ';
    }

    /* Taking support back: out of the way until pointed at. */
    button.remove {
      margin-left: 0.5rem;
      color: var(--muted);
    }

    button.remove:hover:not(:disabled) {
      color: var(--danger);
    }

    button.add {
      margin-top: 0.3rem;
      color: var(--muted);
    }

    button.add:hover,
    button.add[aria-expanded='true'] {
      color: var(--accent);
    }

    /* The sources to add, each added by a click. */
    ul.addable {
      margin-top: 0.2rem;
      padding-left: 0.75rem;
      border-left: 2px solid var(--border);
    }

    ul.addable li {
      padding: 0.1rem 0;
    }

    button.add-one {
      color: var(--fg);
    }

    button.add-one:hover:not(:disabled) {
      color: var(--accent);
    }

    .says {
      display: block;
      color: var(--muted);
    }

    .says.differs {
      color: var(--caution);
    }

    .error {
      margin: 0.3rem 0 0;
      color: var(--danger);
    }
  `
];
