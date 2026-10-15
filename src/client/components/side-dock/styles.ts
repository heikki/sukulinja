import { css } from 'lit';

export const sideDockStyles = css`
  :host {
    position: relative;
    display: block;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--card);
    border-right: 1px solid var(--border);
  }

  /* Laid out at full width and pinned to the dock's right edge, so the content
     slides in with the edge rather than reflowing as the dock grows. */
  .content {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
  }

  /* The whole header collapses the dock; the chevron marks it as a control. */
  .header {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.85rem 1rem 0.85rem 1.1rem;
    background: var(--card);
    color: var(--fg);
    border: 0;
    border-bottom: 1px solid var(--border);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .heading {
    flex: 1;
    min-width: 0;
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  /* The content scrolls under the fixed header. */
  ::slotted(*) {
    flex: 1;
    min-height: 0;
  }

  .rail {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    background: var(--card);
    border: 0;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
    transition: opacity 120ms ease;
  }

  .rail:hover {
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
    color: var(--accent);
  }

  :host([open]) .rail {
    opacity: 0;
    pointer-events: none;
  }

  .rail-heading {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1.6;
  }

  .header:hover {
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }

  .header:hover .chevron {
    color: var(--accent);
  }

  .resize {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
  }

  .resize:hover,
  .resize.active {
    background: color-mix(in srgb, var(--accent) 40%, transparent);
  }
`;
