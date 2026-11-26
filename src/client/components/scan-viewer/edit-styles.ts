import { css, unsafeCSS } from 'lit';

// Editing a source's Link: the pane beside the scan a pending Box is
// edited in, Cancel and Save at its foot, and the layer editing Boxes.

// The width of the pane beside the scan, People here's (people.ts) and
// the one taking its place while a Box is pending, so the scan keeps its
// room, and its zoom, either way: wide enough for an Entry's fields.
export const PANE_PX = 352;

// A pane as People here is: its title, what's asked scrolling under it,
// and the buttons at its foot.
export const scanPaneStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: ${unsafeCSS(PANE_PX)}px;
    min-height: 0;
    background: var(--card);
    border-left: 1px solid var(--border);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  /* As tall as People here's header, whose chevron sets its line. */
  h2 {
    margin: 0;
    padding: 0.5rem 0.75rem;
    line-height: 1.4rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .body {
    display: grid;
    flex: 1;
    align-content: start;
    gap: 0.6rem;
    min-height: 0;
    overflow-y: auto;
    padding: 0.9rem 1rem;
  }

  /* Right under its fields, kept in view at the pane's foot when they
     run longer than it. */
  sl-scan-edit {
    position: sticky;
    bottom: 0;
    margin: 0 -1rem -0.9rem;
    padding: 0.6rem 1rem 0.9rem;
    background: var(--card);
  }
`;

// At the foot of the pane: its buttons at the end, as a modal's are, a
// refusal or what's asked above them, over the shared edit actions' styles.
export const scanEditStyles = css`
  :host {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  p {
    flex-basis: 100%;
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
