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

  .stage {
    position: relative;
    flex: 1;
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

  /* Hidden until fitted, so a new Image doesn't flash at full size. */
  .stage img.unfitted {
    visibility: hidden;
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
