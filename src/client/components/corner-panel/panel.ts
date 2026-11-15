import { css, html, LitElement, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { focusRingStyles } from '@/client/focus-ring';

import { popoverStyles } from './popover';
import { fitted, panelSize, setPanelSize } from './size';
import type { PanelSize } from './size';

export interface CornerTab {
  id: string;
  label: string;
}

export type TabPickEvent = CustomEvent<string>;

// Two strokes in the corner, the way a resizable corner is marked.
const GRIP = html`<svg
  width="14"
  height="14"
  viewBox="0 0 14 14"
  aria-hidden="true"
>
  ${svg`<path d="M3 5 L9 11 M3 9 L5 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" />`}
</svg>`;

function stop(e: Event) {
  e.stopPropagation();
}

// The popover the corner's lists button opens, hanging from it as
// Settings' does: headed by its `tabs`, the `active` one's content slotted
// in. Picking another tab asks for it (`tab`). Its bottom-left corner
// drags it bigger or smaller, and it opens at that size next time.
// Presses and wheel turns on it stay here, so the chart under it doesn't
// pan.
@customElement('sl-corner-panel')
class CornerPanelElement extends LitElement {
  static override styles = [
    focusRingStyles,
    popoverStyles,
    css`
      .popover {
        display: flex;
        flex-direction: column;
        width: min(var(--panel-width), calc(100vw - 2rem));
        height: min(var(--panel-height), calc(100vh - 5rem));
        box-sizing: border-box;
      }

      /* Hangs from the right, so it grows to the left and down. */
      .resize {
        position: absolute;
        left: 2px;
        bottom: 2px;
        width: 14px;
        height: 14px;
        cursor: nesw-resize;
        color: var(--muted);
        opacity: 0.6;
      }

      .resize svg {
        display: block;
      }

      .resize:hover,
      .resize.active {
        opacity: 1;
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

  // The size it's at, and while it's dragged, the size dragged to.
  @state() private size = panelSize();
  @state() private dragged: PanelSize | null = null;

  private readonly onResizeStart = (e: PointerEvent) => {
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const from = this.shownSize();
    const move = (m: PointerEvent) => {
      this.dragged = fitted(
        {
          width: from.width + start.x - m.clientX,
          height: from.height + m.clientY - start.y
        },
        { width: window.innerWidth, height: window.innerHeight }
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (this.dragged !== null) {
        this.size = this.dragged;
        setPanelSize(this.dragged);
      }
      this.dragged = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // The size it's drawn at, the window perhaps holding it smaller.
  private shownSize() {
    const box = this.renderRoot.querySelector('.popover');
    if (box === null) return this.dragged ?? this.size;
    const { width, height } = box.getBoundingClientRect();
    return { width, height };
  }

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
    const size = this.dragged ?? this.size;
    return html`
      <div
        class="popover"
        role="dialog"
        aria-label=${active?.label ?? ''}
        style="--panel-width: ${size.width}px; --panel-height: ${size.height}px"
      >
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
        <div
          class="resize ${this.dragged === null ? '' : 'active'}"
          title="Drag to resize"
          @pointerdown=${this.onResizeStart}
        >
          ${GRIP}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-corner-panel': CornerPanelElement;
  }
}
