import { css } from 'lit';

// Buttons, fields and links, shared by the viewer and its toolbar.
export const controlStyles = css`
  .muted {
    color: var(--muted);
  }

  input {
    width: 4.5em;
    padding: 0.15rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    text-align: right;
  }

  button {
    padding: 0.15rem 0.55rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--card);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--accent);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  button.plain {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
  }

  button.plain:hover {
    text-decoration: underline;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;

export const scanViewerStyles = css`
  /* Covers the chart, not the dock: the dock still shows whose source it is. */
  :host {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  /* The scan, and the people linked to it beside. */
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .stage {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .stage.dragging {
    cursor: grabbing;
  }

  /* Scaled around its top-left so screen = pan + scale * image pixel. */
  .stage img {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    transform-origin: 0 0;
    will-change: transform;
  }

  /* Loading out of sight, or waiting for its turn to show. */
  .stage img.hidden {
    opacity: 0;
  }

  /* The full Image arriving over its blurred thumbnail. */
  .stage img.fade {
    transition: opacity 0.35s ease-out;
  }

  /* A thumbnail is a 250px image scaled up thirtyfold: blurred, its pixels
     read as a soft preview. */
  .stage img.thumb {
    filter: blur(1.5px);
  }

  .frame {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    background: var(--card);
  }

  .note {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--muted);
    pointer-events: none;
  }

  .note button {
    pointer-events: auto;
  }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card) 85%, transparent);
    color: var(--fg);
    box-shadow: 0 1px 6px rgb(0 0 0 / 0.2);
  }

  .loading::before {
    content: '';
    width: 0.8rem;
    height: 0.8rem;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading.later {
    animation: appear 0.2s ease-out 0.15s both;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
`;

// One row, the Volume named in full.
// One row: the title, shortened with an ellipsis where it must be, and
// close.
export const scanToolbarStyles = css`
  :host {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.75rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .volume {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
  }
`;

// Floating over the foot of the scan, centred.
export const scanNavStyles = css`
  :host {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--card) 92%, transparent);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
    white-space: nowrap;
    cursor: auto;
  }
`;

// A column beside the scan; collapsed, a strip with the button to bring it
// back.
export const scanPeopleStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    width: 16rem;
    min-height: 0;
    background: var(--card);
    border-left: 1px solid var(--border);
  }

  :host([collapsed]) {
    width: 2rem;
  }

  /* The whole header hides the list; the chevron marks it as a control. */
  button.head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 0;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    background: var(--card);
    color: var(--fg);
    text-align: left;
    cursor: pointer;
  }

  h2 {
    flex: 1;
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .chevron {
    color: var(--muted);
    font-size: 1rem;
  }

  button.head:hover,
  button.rail:hover {
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }

  button.head:hover .chevron,
  button.rail:hover {
    color: var(--accent);
  }

  button.rail {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border: 0;
    border-radius: 0;
    background: var(--card);
    color: var(--muted);
    cursor: pointer;
  }

  .rail-heading {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--fg);
    white-space: nowrap;
  }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: 0.25rem 0 0.75rem;
  }

  h3 {
    margin: 1.1rem 0.75rem 0.25rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  h3:first-child {
    margin-top: 0.6rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  p {
    margin: 0.6rem 0.75rem;
  }

  button.row {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.3rem 0.75rem;
    border: 0;
    border-left: 3px solid transparent;
    border-radius: 0;
    background: none;
    text-align: left;
  }

  button.row:hover,
  button.row.hovered {
    background: var(--bg);
    color: var(--fg);
  }

  button.row.hovered .name {
    color: var(--accent);
  }

  button.row.current {
    border-left-color: var(--accent);
    background: var(--bg);
  }

  .name {
    font-weight: 500;
  }

  .row .muted {
    font-size: 0.8rem;
  }

  li {
    position: relative;
  }

  /* Shown on the row hovered or focused, and on the viewer's own. */
  button.confirm {
    position: absolute;
    top: 50%;
    right: 0.6rem;
    transform: translateY(-50%);
    padding: 0.1rem 0.5rem;
    font-size: 0.75rem;
    visibility: hidden;
  }

  li:hover button.confirm,
  li:focus-within button.confirm,
  li:has(.current) button.confirm,
  button.confirm:disabled {
    visibility: visible;
  }

  .refused {
    margin: 0 0.75rem 0.3rem;
    color: var(--danger);
    font-size: 0.8rem;
  }
`;

// Over the stage, letting presses through but on the boxes themselves. Red
// stands out on the grey scans. At rest only the entry of the citation the
// viewer is on shows; the others show when hovered, here or by their row.
export const scanEntriesStyles = css`
  :host {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .entry {
    position: absolute;
    box-sizing: border-box;
    border: 2px solid transparent;
    border-radius: 3px;
    pointer-events: auto;
    cursor: pointer;
  }

  .entry.current {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }

  .entry.hovered {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 25%, transparent);
  }
`;
