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

// In the nav, after its divider: one row, as the nav is, over the shared
// edit actions' styles.
export const scanEditStyles = css`
  :host {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding-left: 0.5rem;
    border-left: 1px solid var(--border);
  }

  .also {
    color: var(--muted);
    font-size: 0.8rem;
  }
`;

// Over the whole stage, letting presses through to the scan except on its
// own parts. No stacking of its own, so its parts stack with the viewer's:
// the pending Box under the nav (2), the menus over it.
export const scanLayerStyles = css`
  :host {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  sl-context-menu,
  sl-scan-volumes {
    pointer-events: auto;
  }
`;
