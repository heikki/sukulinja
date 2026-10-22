import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Point } from '@/client/pan-zoom';

import { placedInside } from './helpers';
import { contextMenuStyles } from './styles';

export { placedInside } from './helpers';

// One thing the menu offers, with muted text beside its label when it has
// some: who someone is to the Selected person before, their years after.
export interface MenuItem {
  label: string;
  muted?: { before?: string; after?: string };
  run: () => void;
}

function stop(e: Event) {
  e.stopPropagation();
}

// What a right-click offers, drawn in the page in place of WebKit's own
// menu, at `at` in the element it's positioned in and kept inside it, under
// its `heading` when it has one; with `alignRight`, `at` is its top-right
// corner, for a menu dropping from a button's right edge. Presses on it stay on it, so they don't pan
// what's under it. A choice, Esc or a press anywhere else asks to `close`.
// ↑/↓ move between the items.
@customElement('sl-context-menu')
export class ContextMenuElement extends LitElement {
  static override styles = contextMenuStyles;

  @property({ attribute: false }) items: MenuItem[] = [];
  @property({ attribute: false }) heading: string | null = null;
  @property({ attribute: false }) at: Point = { x: 0, y: 0 };
  @property({ attribute: false }) alignRight = false;

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
    const left = this.alignRight ? this.at.x - this.offsetWidth : this.at.x;
    const { x, y } = placedInside(this, { x: left, y: this.at.y });
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

  // Every key handled is marked so, or what's under the menu acts on Esc and
  // the arrows too, and WKWebView hands them on to macOS, which beeps.
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
            ${
              item.muted?.before === undefined
                ? nothing
                : html`<span class="muted before">${item.muted.before}</span>`
            }${item.label}${
              item.muted?.after === undefined
                ? nothing
                : html`<span class="muted after">${item.muted.after}</span>`
            }
          </button>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-context-menu': ContextMenuElement;
  }
}
