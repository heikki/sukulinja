import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Point } from '@/client/pan-zoom';

import { placedInside } from './helpers';
import { contextMenuStyles } from './styles';

export { placedInside } from './helpers';

// One thing the menu offers, with muted text beside its label when it has
// some: who someone is to the Selected person before, their years after;
// and with `detail`, what it acts on, muted on a line of its own below.
// `hover` hears when it's pointed at or focused, and when that ends.
export interface MenuItem {
  label: string;
  muted?: { before?: string; after?: string };
  detail?: string;
  hover?: (on: boolean) => void;
  run: () => void;
}

// A step asked first where the menu was, as a dialog asks: its title, what
// it does, then Cancel and the step side by side; `tone` colours the step,
// red where it takes away what can't be got back.
export interface MenuAsk {
  title: string;
  question: string;
  step: { label: string; tone: 'danger' | 'primary'; run: () => void };
}

function stop(e: Event) {
  e.stopPropagation();
}

// What a right-click offers, drawn in the page in place of WebKit's own
// menu, at `at` in the element it's positioned in and kept inside it, under
// its `heading` when it has one, or with `ask`, its question in place of
// the items; with `alignRight`, `at` is its top-right
// corner, for a menu dropping from a button's right edge. Presses on it stay on it, so they don't pan
// what's under it. A choice, Esc or a press anywhere else asks to `close`.
// ↑/↓ move between the items, ←/→ between an ask's buttons.
@customElement('sl-context-menu')
class ContextMenuElement extends LitElement {
  static override styles = contextMenuStyles;

  @property({ attribute: false }) items: MenuItem[] = [];
  @property({ attribute: false }) heading: string | null = null;
  @property({ attribute: false }) at: Point = { x: 0, y: 0 };
  @property({ attribute: false }) alignRight = false;
  @property({ attribute: false }) ask: MenuAsk | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('mousedown', this.onOutside);
    window.addEventListener('blur', this.close);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    for (const item of this.items) item.hover?.(false);
    window.removeEventListener('mousedown', this.onOutside);
    window.removeEventListener('blur', this.close);
  }

  // An ask is named by its title and read with its question.
  override willUpdate() {
    const { ask } = this;
    this.setAttribute('role', ask === null ? 'menu' : 'alertdialog');
    if (ask === null) {
      this.removeAttribute('aria-label');
      this.removeAttribute('aria-description');
    } else {
      this.setAttribute('aria-label', ask.title);
      this.setAttribute('aria-description', ask.question);
    }
  }

  // The first item focused, or an ask's Cancel, so Enter alone never takes
  // its step; again when the same menu turns into an ask.
  override firstUpdated() {
    this.buttons()[0]?.focus();
  }

  override updated(changed: PropertyValues<this>) {
    if (changed.has('ask') && changed.get('ask') !== undefined) {
      this.buttons()[0]?.focus();
    }
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
    const moves: Record<string, number> =
      this.ask === null
        ? { ArrowDown: 1, ArrowUp: -1 }
        : { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 0, ArrowUp: 0 };
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

  private renderAsk({ title, question, step }: MenuAsk) {
    return html`
      <h2>${title}</h2>
      <p>${question}</p>
      <div class="actions">
        <button class="act" @click=${this.close}>Cancel</button>
        <button
          class="act ${step.tone}"
          @click=${() => {
            this.close();
            step.run();
          }}
        >
          ${step.label}
        </button>
      </div>
    `;
  }

  override render() {
    if (this.ask !== null) return this.renderAsk(this.ask);
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
            @mouseenter=${() => item.hover?.(true)}
            @mouseleave=${() => item.hover?.(false)}
            @focus=${() => item.hover?.(true)}
            @blur=${() => item.hover?.(false)}
          >
            ${
              item.muted?.before === undefined
                ? nothing
                : html`<span class="muted before">${item.muted.before}</span>`
            }${item.label}${
              item.muted?.after === undefined
                ? nothing
                : html`<span class="muted after">${item.muted.after}</span>`
            }${
              item.detail === undefined
                ? nothing
                : html`<span class="muted detail">${item.detail}</span>`
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
