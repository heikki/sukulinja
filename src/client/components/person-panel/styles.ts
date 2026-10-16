import { css } from 'lit';

import { silhouetteStyles } from '../tree-view/silhouette';

export const personPanelStyles = css`
  :host {
    display: block;
    overflow-y: auto;
    background: var(--card);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .body {
    padding: 0 1.1rem 2rem;
  }

  .body.muted {
    padding-top: 1rem;
  }

  .body.stale {
    opacity: 0.55;
  }

  /* Sections are banded across the panel's full width. */
  section {
    margin: 0 -1.1rem;
    padding: 0.85rem 1.1rem;
    border-bottom: 1px solid var(--border);
  }

  .section-body {
    margin-top: 0.6rem;
  }

  .section-body > .source:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .section-body > .source:first-child.viewing::before {
    top: 0;
  }

  h3 {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* A section heading that shows or hides the section, its chevron at the
     far right as on the dock's header. */
  button.toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    text-align: left;
    cursor: pointer;
  }

  button.toggle::after {
    content: '›';
    font-size: 1rem;
    font-weight: 400;
    line-height: 1;
    transition: transform 0.15s;
  }

  button.toggle[aria-expanded='true']::after {
    transform: rotate(90deg);
  }

  button.toggle:hover {
    color: var(--fg);
  }

  .muted {
    color: var(--muted);
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.2rem 0.75rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .source {
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
  }

  /* The source the Scan viewer shows: an accent bar in the gutter, so the
     text doesn't shift. */
  .source.viewing {
    position: relative;
  }

  .source.viewing::before {
    content: '';
    position: absolute;
    top: 0.75rem;
    bottom: 0.75rem;
    left: -0.65rem;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }

  /* The source's heading, which shows or hides the rest of it. */
  button.head {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  button.head::before {
    content: '▸';
    flex: none;
    font-size: 0.7rem;
    color: var(--muted);
    transition: transform 0.15s;
  }

  button.head[aria-expanded='true']::before {
    transform: rotate(90deg);
  }

  button.head:hover {
    color: var(--accent);
  }

  .source .who {
    margin-top: 0.5rem;
  }

  .who {
    margin: 0.15rem 0 0.4rem;
    font-weight: 600;
  }

  .text {
    margin: 0.25rem 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  details {
    margin-top: 0.5rem;
  }

  summary {
    cursor: pointer;
    color: var(--muted);
  }

  table {
    margin-top: 0.35rem;
    border-collapse: collapse;
    width: 100%;
  }

  td {
    padding: 0.1rem 0.5rem 0.1rem 0;
    vertical-align: top;
  }

  td:first-child,
  td:last-child {
    color: var(--muted);
    white-space: nowrap;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin-top: 0.5rem;
  }

  /* Links leaving the app keep to the right, apart from the in-app ones. */
  .links a {
    margin-left: auto;
  }

  button.scan {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }

  button.scan:hover {
    text-decoration: underline;
  }

  button.scan[aria-current] {
    font-weight: 600;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

export const personHeaderStyles = [
  silhouetteStyles,
  css`
    :host {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      min-width: 0;
    }

    .portrait {
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
    }

    .who {
      min-width: 0;
    }

    .name {
      font-size: 1.15rem;
      font-weight: 600;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0 0.6rem;
      margin: 0.2rem 0 0;
      font-size: 0.8rem;
      line-height: 1.4;
    }

    dt {
      color: var(--muted);
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `
];
