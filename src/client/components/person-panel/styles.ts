import { css } from 'lit';

export const personPanelStyles = css`
  :host {
    display: block;
    width: 380px;
    flex-shrink: 0;
    overflow-y: auto;
    background: var(--card);
    border-left: 1px solid var(--border);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .body {
    padding: 1rem 1.1rem 2rem;
  }

  .body.stale {
    opacity: 0.55;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  h3 {
    margin: 1.4rem 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--muted);
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

  .caption {
    font-size: 0.75rem;
    color: var(--muted);
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

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;
