import { css } from 'lit';

// Editing a source's Link: Cancel and Save under
// the pending Box, the scan's menu, and the layer editing Boxes.

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

  sl-ask,
  sl-context-menu,
  sl-volume-picker {
    pointer-events: auto;
  }
`;
