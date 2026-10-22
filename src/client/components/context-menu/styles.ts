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
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
    font-size: 0.875rem;
    line-height: 1.4;
    cursor: auto;
  }

  h3 {
    margin: 0 0 0.3rem;
    padding: 0.2rem 0.5rem 0.4rem;
    overflow: hidden;
    border-bottom: 1px solid var(--border);
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
`;

export const contextMenuStyles = [focusRingStyles, menu];
