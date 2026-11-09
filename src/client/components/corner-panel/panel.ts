import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { dialogStyles } from '@/client/dialog-styles';
import { Floating, floatingStyles } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';

function stop(e: Event) {
  e.stopPropagation();
}

// The panel a corner button opens: a card floating over the chart, headed
// by `heading`, its content slotted in and anything under the list in the
// `actions` slot. It's dragged by its background and opens where panels
// of its `kind` were last left. ✕ in its corner or Esc asks to `close`, and
// presses on it stay here.
@customElement('sl-corner-panel')
class CornerPanelElement extends LitElement {
  static override styles = [
    focusRingStyles,
    dialogStyles,
    floatingStyles,
    css`
      :host {
        --panel-width: 34rem;
      }

      .dialog {
        padding: 1rem;
        flex-direction: column;
        max-width: none;
        max-height: min(36rem, calc(100vh - 4rem));
      }

      .dialog:popover-open {
        display: flex;
      }

      /* The heading, muted as a Reminder's is, and closing in the corner. */
      .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        margin: 0 0 0.5rem;
      }

      .dialog .top h2 {
        margin: 0;
        color: var(--muted);
        font-size: 0.85rem;
        font-weight: 400;
      }

      .dialog button.close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        margin: -0.25rem -0.25rem 0 0;
        padding: 0;
        border: 0;
        background: none;
        color: var(--muted);
        font-size: 0.9rem;
      }

      .dialog button.close:hover {
        background: color-mix(in srgb, var(--fg) 8%, transparent);
        color: var(--fg);
      }

      .actions {
        align-items: center;
      }
    `
  ];

  @property() heading = '';

  @property() kind = '';

  private readonly floating = new Floating(this, () => this.kind);

  override connectedCallback() {
    super.connectedCallback();
    for (const type of [
      'pointerdown',
      'mousedown',
      'wheel',
      'dblclick',
      'contextmenu'
    ]) {
      this.addEventListener(type, stop);
    }
    this.addEventListener('keydown', this.onKeyDown);
  }

  private readonly close = () => {
    this.dispatchEvent(new CustomEvent('close'));
  };

  // Esc is its own; other keys go on, so what's under it still has them.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };

  override render() {
    return html`
      <div
        class="dialog"
        popover="manual"
        role="dialog"
        aria-label=${this.heading}
        @pointerdown=${this.floating.grip}
      >
        <div class="top">
          <h2>${this.heading}</h2>
          <button class="close" aria-label="Close" @click=${this.close}>
            ✕
          </button>
        </div>
        <slot></slot>
        <div class="actions"><slot name="actions"></slot></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-corner-panel': CornerPanelElement;
  }
}
