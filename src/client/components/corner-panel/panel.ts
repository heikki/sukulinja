import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { dialogStyles } from '@/client/dialog-styles';
import { Floating, floatingStyles } from '@/client/floating';
import { focusRingStyles } from '@/client/focus-ring';

function stop(e: Event) {
  e.stopPropagation();
}

export interface CornerTab {
  id: string;
  label: string;
}

export type TabPickEvent = CustomEvent<string>;

// The panel the corner buttons open: one card floating over the chart,
// headed by its `tabs`, the `active` one's content slotted in. Picking
// another tab asks for it (`tab`). It's dragged by its background and opens
// where it was last left. ✕ in its corner or Esc asks to `close`, and
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
        /* One height for every tab, so switching doesn't move it. */
        height: min(36rem, calc(100vh - 4rem));
      }

      .dialog:popover-open {
        display: flex;
      }

      /* The tabs, muted but the active one, and closing in the corner. */
      .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        margin: 0 0 0.5rem;
      }

      .tabs {
        display: flex;
        gap: 1rem;
      }

      .dialog .tabs button {
        padding: 0 0 0.2rem;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        background: none;
        color: var(--muted);
        font-size: 0.85rem;
      }

      .dialog .tabs button:hover {
        color: var(--fg);
      }

      .dialog .tabs button[aria-selected='true'] {
        border-bottom-color: var(--accent);
        color: var(--fg);
      }

      /* What the active tab lists fills the rest, scrolling itself. */
      .content {
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
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
    `
  ];

  @property({ attribute: false }) tabs: CornerTab[] = [];

  @property() active = '';

  private readonly floating = new Floating(this, 'corner');

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

  private renderTabs() {
    return html`<div class="tabs" role="tablist">
      ${repeat(
        this.tabs,
        (t) => t.id,
        (t) =>
          html`<button
            role="tab"
            aria-selected=${t.id === this.active ? 'true' : 'false'}
            @click=${() => {
              this.dispatchEvent(new CustomEvent('tab', { detail: t.id }));
            }}
          >
            ${t.label}
          </button>`
      )}
    </div>`;
  }

  override render() {
    const active = this.tabs.find((t) => t.id === this.active);
    return html`
      <div
        class="dialog"
        popover="manual"
        role="dialog"
        aria-label=${active?.label ?? ''}
        @pointerdown=${this.floating.grip}
      >
        <div class="top">
          ${this.renderTabs()}
          <button class="close" aria-label="Close" @click=${this.close}>
            ✕
          </button>
        </div>
        <div class="content" role="tabpanel"><slot></slot></div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-corner-panel': CornerPanelElement;
  }
}
