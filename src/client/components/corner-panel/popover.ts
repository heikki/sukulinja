import { css } from 'lit';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

// Says which corner popover just opened, so any other closes.
const OPENED = 'corner-popover-open';

// Whether a popover hanging from a button in the chart's top-right corner,
// as Settings' does, is open: only one is at a time, and a press outside
// its host or Esc closes it. `escape` may take Esc for something open
// inside it first.
export class CornerPopover implements ReactiveController {
  private listening = false;
  private shown = false;

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly escape: () => void = () => {
      this.set(false);
    }
  ) {
    host.addController(this);
  }

  get open() {
    return this.shown;
  }

  set(open: boolean) {
    if (open === this.shown) return;
    this.shown = open;
    if (open) {
      window.dispatchEvent(new CustomEvent(OPENED, { detail: this.host }));
    }
    this.listen(open);
    this.host.requestUpdate();
  }

  hostConnected() {
    window.addEventListener(OPENED, this.onOpened);
  }

  hostDisconnected() {
    window.removeEventListener(OPENED, this.onOpened);
    this.shown = false;
    this.listen(false);
  }

  private listen(on: boolean) {
    if (on === this.listening) return;
    this.listening = on;
    if (on) {
      document.addEventListener('pointerdown', this.onPointerDown);
      document.addEventListener('keydown', this.onKeyDown);
    } else {
      document.removeEventListener('pointerdown', this.onPointerDown);
      document.removeEventListener('keydown', this.onKeyDown);
    }
  }

  private readonly onOpened = (e: Event) => {
    if ((e as CustomEvent).detail !== this.host) this.set(false);
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!e.composedPath().includes(this.host)) this.set(false);
  };

  // Marked handled, or WKWebView hands Escape on to macOS, which beeps.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    this.escape();
  };
}

// The popover's card, dropped just under its button with the arrow up to
// it, sharing the button's right edge; the host is positioned around the
// button.
export const popoverStyles = css`
  .popover {
    position: absolute;
    top: calc(100% + 0.6rem);
    right: 0;
    z-index: 20;
    padding: 1rem;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px var(--shadow);
  }

  /* The arrow up to the button: a square turned 45° on the top edge,
     centred under the button. Only its outer two sides carry the border, so
     it reads as part of the popover's outline. */
  .popover::before {
    content: '';
    position: absolute;
    top: -6px;
    right: calc(1rem - 5px);
    width: 10px;
    height: 10px;
    background: var(--card);
    border-top: 1px solid var(--border);
    border-left: 1px solid var(--border);
    transform: rotate(45deg);
  }
`;
