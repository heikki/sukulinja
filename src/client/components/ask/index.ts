import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';
import { markModal } from '@/client/modals';
import type { Point } from '@/client/pan-zoom';

// A step asked first: its title, what it does (text, or a template for a
// word in bold) unless the title says it all, and the step's button, coloured by `tone`: red where it
// takes away what can't be got back, else the accent.
export interface Ask {
  title: string;
  text?: unknown;
  step: string;
  tone: 'danger' | 'primary';
}

function stop(e: Event) {
  e.stopPropagation();
}

// Asks before a step, a modal over everything: Cancel and the step side by
// side, Cancel focused so Enter alone never takes it. Without `at`, centred
// in the window over a scrim; with `at`, where the menu that asked was, in
// the element the ask is positioned in and kept inside it, nothing dimmed.
// `cancel` is asked for by Cancel, Esc or a press outside it, which goes
// no further; `confirm` by the step. While `busy` names what's being done,
// on the step, neither is offered; `refused` says why the last step wasn't
// taken. ←/→ move between the buttons, and Tab keeps to them.
@customElement('sl-ask')
class AskElement extends LitElement {
  static override styles = [
    focusRingStyles,
    dialogStyles,
    css`
      /* Where the menu was is measured from the element it's in. */
      :host {
        position: absolute;
        top: 0;
        left: 0;
      }

      /* The card a modal's is (dialog-styles.ts), centred by the
         dialog itself and only as wide as it needs. */
      dialog.dialog {
        width: max-content;
        max-width: min(22rem, calc(100vw - 2rem));
        margin: auto;
        padding: 0;
        color: var(--fg);
        cursor: auto;
      }

      dialog::backdrop {
        background: var(--scrim);
      }

      dialog.dialog.placed {
        margin: 0;
      }

      dialog.placed::backdrop {
        background: none;
      }

      /* The card's own padding, inside the dialog, so a press on it is
         never a press on the backdrop. */
      .card {
        padding: 0.9rem 1rem;
        outline: none;
      }

      /* With no text under it, the title keeps the room the text's
         paragraph leaves above the buttons. */
      dialog h2.alone {
        margin-bottom: 1.2rem;
      }

      /* The app's words, which can be a long raw path. */
      dialog p.refused {
        max-height: 6.5rem;
        overflow-y: auto;
        overflow-wrap: anywhere;
        color: var(--danger);
        -webkit-user-select: text;
      }
    `
  ];

  @property({ attribute: false }) ask: Ask | null = null;
  @property({ attribute: false }) at: Point | null = null;
  @property({ attribute: false }) busy: string | null = null;
  @property({ attribute: false }) refused: string | null = null;

  @query('dialog') private readonly dialog!: HTMLDialogElement | null;

  constructor() {
    super();
    markModal(this, () => this.ask !== null);
  }

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', this.onBlur);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('blur', this.onBlur);
  }

  override updated() {
    const { dialog } = this;
    if (dialog === null) return;
    if (!dialog.open) {
      dialog.showModal();
      this.buttons()[0]?.focus();
    }
    // Its buttons off while busy, focus stays in it, so its keys are its.
    if (this.busy !== null) {
      this.renderRoot.querySelector<HTMLElement>('.card')?.focus();
    }
    const at = this.placed(dialog);
    if (at === null) return;
    dialog.style.left = `${at.x}px`;
    dialog.style.top = `${at.y}px`;
  }

  // Where the menu was in the element this is positioned in, moved in from
  // any edge of it the ask would cross, in the window; null when centred.
  private placed(dialog: HTMLDialogElement): Point | null {
    const { at } = this;
    const box = this.offsetParent?.getBoundingClientRect();
    if (at === null || box === undefined) return null;
    const x = Math.min(at.x, box.width - dialog.offsetWidth - 4);
    const y = Math.min(at.y, box.height - dialog.offsetHeight - 4);
    return { x: box.left + Math.max(4, x), y: box.top + Math.max(4, y) };
  }

  private buttons() {
    return [...this.renderRoot.querySelectorAll('button')];
  }

  private readonly cancel = () => {
    if (this.busy !== null) return;
    this.dispatchEvent(new CustomEvent('cancel'));
  };

  private readonly confirm = () => {
    if (this.busy !== null) return;
    this.dispatchEvent(new CustomEvent('confirm'));
  };

  // Presses outside the card land on the dialog itself, over its backdrop.
  private readonly onClick = (e: MouseEvent) => {
    if (e.target === this.dialog) this.cancel();
  };

  // Esc as the dialog hears it: asked for, as by Cancel, not closed.
  private readonly onCancel = (e: Event) => {
    e.preventDefault();
    this.cancel();
  };

  // Closed by the browser all the same, as it may on a second Esc: shown
  // again while busy, else taken as Cancel.
  private readonly onClose = () => {
    if (!this.isConnected || this.ask === null) return;
    if (this.busy === null) this.cancel();
    else this.dialog?.showModal();
  };

  private readonly onBlur = () => {
    if (this.at !== null) this.cancel();
  };

  // Every key handled is marked so, or what's under it acts on Esc and the
  // arrows too, a popover it opens from closes, and WKWebView hands them on
  // to macOS, which beeps.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const buttons = this.buttons();
    const at = buttons.findIndex((b) => b === this.shadowRoot?.activeElement);
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 0,
      ArrowUp: 0,
      Tab: e.shiftKey ? -1 : 1
    };
    const by = moves[e.key];
    if (e.key !== 'Escape' && by === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    if (by === undefined) {
      this.cancel();
      return;
    }
    const n = buttons.length;
    buttons[(at + by + n) % n]?.focus();
  };

  override render() {
    if (this.ask === null) return nothing;
    const { title, text, step, tone } = this.ask;
    const busy = this.busy !== null;
    return html`<dialog
      class=${this.at === null ? 'dialog' : 'dialog placed'}
      role="alertdialog"
      aria-labelledby="title"
      aria-describedby=${text === undefined ? nothing : 'text'}
      @click=${this.onClick}
      @cancel=${this.onCancel}
      @close=${this.onClose}
    >
      <div class="card" tabindex="-1">
        <h2 id="title" class=${text === undefined ? 'alone' : ''}>${title}</h2>
        ${text === undefined ? nothing : html`<p id="text">${text}</p>`}
        ${
          this.refused === null
            ? nothing
            : html`<p class="refused" role="alert">${this.refused}</p>`
        }
        <div class="actions">
          <button ?disabled=${busy} @click=${this.cancel}>Cancel</button>
          <button class=${tone} ?disabled=${busy} @click=${this.confirm}>
            ${this.busy ?? step}
          </button>
        </div>
      </div>
    </dialog>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-ask': AskElement;
  }
}
