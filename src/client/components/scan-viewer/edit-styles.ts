import { css } from 'lit';

// Editing a source's Link: the Volumes to look in, Cancel and Save under
// the pending Box, the scan's menu, and the layer editing Boxes.

// The Volumes to look in, over the scan where the menu was.
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

// In the nav, after its divider: one row, as the nav is.
export const scanEditStyles = css`
  :host {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-left: 0.5rem;
    border-left: 1px solid var(--border);
  }

  p {
    margin: 0;
  }

  p.cite {
    white-space: nowrap;
  }

  /* What the new Citation's entry is: one line, written left to right as
     text is, where the control styles right-align an Image number. */
  input.cite-text {
    width: 16rem;
    text-align: left;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  button {
    white-space: nowrap;
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

  button.discard {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--bg);
  }

  button.discard:hover:not(:disabled) {
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

// Over the whole stage, letting presses through to the scan except on its
// own parts. No stacking of its own, so its parts stack with the viewer's:
// the Box under the nav (2), the menus over it.
export const scanLayerStyles = css`
  :host {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  sl-context-menu,
  sl-scan-volumes,
  sl-scan-reminders,
  sl-reminder-dialog,
  .search,
  .box {
    pointer-events: auto;
  }

  /* The person search, where the menu was, to cite the entry for someone
     outside the family. */
  .search {
    position: absolute;
    z-index: 2;
    width: 16rem;
  }

  /* The pending Box: red as the entries' Boxes are, but dashed, so it
     reads as not saved yet. */
  .box {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    border: 2px dashed var(--danger);
    border-radius: 3px;
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    cursor: move;
  }

  .grip {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -6px 0 0 -6px;
    border: 1px solid color-mix(in srgb, var(--danger) 70%, black);
    border-radius: 2px;
    background: var(--danger);
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

// The Reminders on the Image shown, rising from the page nav's marker.
export const scanRemindersStyles = css`
  :host {
    position: absolute;
    z-index: 3;
    display: block;
    width: min(22rem, calc(100% - 2rem));
    max-height: min(20rem, 60%);
    overflow-y: auto;
    padding: 0.35rem;
    transform: translate(-50%, -100%);
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
    font-size: 0.875rem;
    cursor: auto;
  }

  h3 {
    margin: 0.2rem 0.5rem 0.3rem;
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
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .text {
    white-space: pre-line;
  }

  .on,
  .muted {
    color: var(--muted);
    font-size: 0.85em;
  }

  p {
    margin: 0.3rem 0.5rem;
  }

  p.error {
    color: var(--danger);
  }
`;
