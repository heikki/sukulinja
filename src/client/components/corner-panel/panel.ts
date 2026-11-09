import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { focusRingStyles } from '@/client/focus-ring';

import { popoverStyles } from './popover';

export interface CornerTab {
  id: string;
  label: string;
}

export type TabPickEvent = CustomEvent<string>;

function stop(e: Event) {
  e.stopPropagation();
}

// The popover the corner's lists button opens, hanging from it as
// Settings' does: headed by its `tabs`, the `active` one's content slotted
// in. Picking another tab asks for it (`tab`). Presses and wheel turns on
// it stay here, so the chart under it doesn't pan.
@customElement('sl-corner-panel')
class CornerPanelElement extends LitElement {
  static override styles = [
    focusRingStyles,
    popoverStyles,
    css`
      .popover {
        display: flex;
        flex-direction: column;
        width: min(32rem, calc(100vw - 2rem));
        height: min(36rem, calc(100vh - 5rem));
        box-sizing: border-box;
      }

      /* The tabs, muted but the active one. */
      .tabs {
        display: flex;
        gap: 1rem;
        margin: 0 0 0.75rem;
      }

      .tabs button {
        padding: 0 0 0.2rem;
        border: 0;
        border-bottom: 2px solid transparent;
        background: none;
        color: var(--muted);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }

      .tabs button:hover {
        color: var(--fg);
      }

      .tabs button[aria-selected='true'] {
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
    `
  ];

  @property({ attribute: false }) tabs: CornerTab[] = [];

  @property() active = '';

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
  }

  override render() {
    const active = this.tabs.find((t) => t.id === this.active);
    return html`
      <div class="popover" role="dialog" aria-label=${active?.label ?? ''}>
        <div class="tabs" role="tablist">
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
