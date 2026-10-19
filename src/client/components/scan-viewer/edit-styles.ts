import { css } from 'lit';

// Editing a source's Link: the Volumes to change to, the bar with the
// change pending, the scan's menu, and the layer drawing Boxes.

// The Volumes to change to, over the scan where the menu was.
export const scanVolumesStyles = css`
  :host {
    position: absolute;
    z-index: 3;
    display: block;
    width: min(32rem, calc(100vw - 2rem));
    max-height: min(28rem, 70vh);
    overflow-y: auto;
    padding: 0.35rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
    white-space: normal;
  }

  h3 {
    margin: 0.4rem 0.5rem 0.2rem;
    color: var(--muted);
    font-size: 0.8em;
    font-weight: 500;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    display: block;
    width: 100%;
    padding: 0.3rem 0.5rem;
    overflow: hidden;
    border-color: transparent;
    background: none;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button:hover:not(:disabled) {
    border-color: transparent;
    background: color-mix(in srgb, var(--fg) 8%, transparent);
    color: var(--fg);
  }

  button.current {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    font-weight: 500;
  }

  p {
    margin: 0.4rem 0.5rem;
  }
`;

// Floating over the top of the scan, centred, while a change is pending.
export const scanEditStyles = css`
  :host {
    position: absolute;
    top: 1rem;
    left: 50%;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: min(30rem, calc(100% - 2rem));
    padding: 0.6rem 0.75rem;
    transform: translateX(-50%);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--card) 96%, transparent);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
    cursor: auto;
  }

  h3 {
    margin: 0;
    overflow: hidden;
    font-size: 1em;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.6rem;
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  button.save {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
  }

  button.save:hover:not(:disabled) {
    color: var(--bg);
    filter: brightness(1.1);
  }

  .refused {
    color: var(--danger);
    font-size: 0.8rem;
  }

  .also {
    color: var(--muted);
    font-size: 0.8rem;
  }
`;

// At the pointer, over the scan.
export const scanMenuStyles = css`
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
    cursor: auto;
  }

  button {
    padding: 0.3rem 0.5rem;
    border-color: transparent;
    background: none;
    text-align: left;
    white-space: nowrap;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    border-color: transparent;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--fg);
  }
`;

// Over the whole stage, letting presses through to the scan except on its
// own parts.
export const scanLayerStyles = css`
  :host {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  sl-scan-menu,
  sl-scan-volumes,
  .draw,
  .box {
    pointer-events: auto;
  }

  .draw {
    position: absolute;
    inset: 0;
    cursor: crosshair;
  }

  /* The pending Box: the accent, dashed, so it reads as not saved yet. */
  .box {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    cursor: move;
  }

  .grip {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -6px 0 0 -6px;
    border: 1px solid var(--bg);
    border-radius: 2px;
    background: var(--accent);
  }

  .grip.n,
  .grip.s {
    left: 50%;
    cursor: ns-resize;
  }

  .grip.e,
  .grip.w {
    top: 50%;
    cursor: ew-resize;
  }

  .grip.n,
  .grip.ne,
  .grip.nw {
    top: 0;
  }

  .grip.s,
  .grip.se,
  .grip.sw {
    top: 100%;
  }

  .grip.w,
  .grip.nw,
  .grip.sw {
    left: 0;
  }

  .grip.e,
  .grip.ne,
  .grip.se {
    left: 100%;
  }

  .grip.ne,
  .grip.sw {
    cursor: nesw-resize;
  }

  .grip.nw,
  .grip.se {
    cursor: nwse-resize;
  }
`;
