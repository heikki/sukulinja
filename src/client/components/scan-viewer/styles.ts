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

  .blank {
    position: relative;
    flex: 1;
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

// One row; the mark's note gives way first when it is narrow.
export const scanToolbarStyles = css`
  :host {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.25rem;
    padding: 0.3rem 0.75rem;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  select {
    max-width: 18rem;
    min-width: 8rem;
    padding: 0.15rem 0.35rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    text-overflow: ellipsis;
  }

  .sep {
    align-self: stretch;
    width: 1px;
    margin: 0.15rem 0.25rem;
    background: var(--border);
  }

  .spacer {
    flex: 1;
  }

  button.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  button.primary:hover:not(:disabled) {
    color: var(--on-accent);
    filter: brightness(1.1);
  }

  .linked {
    color: var(--accent);
  }

  .note {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .note.error {
    color: var(--danger);
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
    width: auto;
    padding: 0.4rem 0.3rem;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.5rem 0.4rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
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

  button.toggle {
    padding: 0 0.45rem;
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
