import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Point } from '@client/pan-zoom';
import type { Viewer } from '@client/state';

import { scanMenuStyles } from './edit-styles';
import { placedInside } from './helpers';
import { controlStyles } from './styles';

// One thing the menu offers.
export interface MenuItem {
  label: string;
  run: () => void;
}

// What the menu offers for the current source's Link; the menu is titled
// with its person. On its own entry Box (`onBox`), only that Box: a Vision
// match's or a Mark's to edit or discard, and once it's pending, the change
// to discard. Confirming a Vision match is beside the scan. Elsewhere: a
// pending Box for the person's entry (only over the full Image, `canBox`),
// and Change Volume…, which only shows another Volume.
export function linkItems(
  viewer: Viewer,
  where: { onBox: boolean; canBox: boolean },
  open: { chooseVolume: () => void; placeBox: () => void }
) {
  const items: MenuItem[] = [];
  if (where.onBox) {
    if (viewer.boxPending.get()) {
      items.push({ label: 'Discard changes', run: viewer.cancel });
      return items;
    }
    if (viewer.source.get()?.link?.certainty === 'vision') {
      items.push(
        { label: 'Edit match', run: viewer.editBox },
        { label: 'Discard match', run: viewer.discard }
      );
    } else {
      items.push(
        { label: 'Edit mark', run: viewer.editBox },
        { label: 'Discard mark', run: viewer.discard }
      );
    }
    return items;
  }
  if (where.canBox) {
    items.push({ label: 'Mark entry', run: open.placeBox });
  }
  items.push({ label: 'Change Volume…', run: open.chooseVolume });
  return items;
}

function stop(e: Event) {
  e.stopPropagation();
}

// What a right-click on the scan offers for the current source's Link,
// drawn in the page in place of WebKit's own menu, at `at` in the stage
// and kept inside it, under its `heading` when it has one. A choice, Esc
// or a press anywhere else asks to `close`. ↑/↓ move between the items.
@customElement('sl-scan-menu')
export class ScanMenuElement extends LitElement {
  static override styles = [controlStyles, scanMenuStyles];

  @property({ attribute: false }) items: MenuItem[] = [];
  @property({ attribute: false }) heading: string | null = null;
  @property({ attribute: false }) at: Point = { x: 0, y: 0 };

  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute('role', 'menu');
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('mousedown', this.onOutside);
    window.addEventListener('blur', this.close);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousedown', this.onOutside);
    window.removeEventListener('blur', this.close);
  }

  override firstUpdated() {
    this.buttons()[0]?.focus();
  }

  override updated() {
    const { x, y } = placedInside(this, this.at);
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
  }

  private buttons() {
    return [...this.renderRoot.querySelectorAll('button')];
  }

  private readonly close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };

  private readonly onOutside = (e: MouseEvent) => {
    if (!e.composedPath().includes(this)) this.close();
  };

  // Every key handled is marked so, or the viewer's own Esc and arrows act
  // on it too, and WKWebView hands it on to macOS, which beeps.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const buttons = this.buttons();
    const at = buttons.findIndex((b) => b === this.shadowRoot?.activeElement);
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
    const by = moves[e.key];
    if (e.key !== 'Escape' && by === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    if (by === undefined) {
      this.close();
      return;
    }
    const n = buttons.length;
    buttons[(at + by + n) % n]?.focus();
  };

  private choose(item: MenuItem) {
    this.close();
    item.run();
  }

  override render() {
    return html`
      ${
        this.heading === null
          ? nothing
          : html`<h3 role="presentation">${this.heading}</h3>`
      }
      ${this.items.map(
        (item) => html`
          <button
            role="menuitem"
            @click=${() => {
              this.choose(item);
            }}
          >
            ${item.label}
          </button>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-menu': ScanMenuElement;
  }
}
