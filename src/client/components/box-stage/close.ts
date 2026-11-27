import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';

function stop(e: Event) {
  e.stopPropagation();
}

// A viewer's ×, over its picture's top right corner: a see-through bubble
// like the Scan viewer's page, which asks the viewer to close (`close`).
// Pointer and wheel input stays here, so a press doesn't pan.
@customElement('sl-viewer-close')
class ViewerCloseElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        position: absolute;
        top: 0.75rem;
        right: 0.75rem;
        z-index: 2;
      }

      /* A circle, the × drawn at its centre: a glyph sits low in its
         line. */
      button {
        display: grid;
        place-items: center;
        /* As tall as the page's bubble: its line and padding. */
        box-sizing: border-box;
        width: calc(1lh + 0.6rem + 2px);
        height: calc(1lh + 0.6rem + 2px);
        padding: 0;
        font: inherit;
        border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, var(--card) 55%, transparent);
        backdrop-filter: blur(6px);
        color: var(--muted);
        cursor: pointer;
      }

      button:hover {
        color: var(--fg);
      }
    `
  ];

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick', 'contextmenu']) {
      this.addEventListener(type, stop);
    }
  }

  override render() {
    return html`<button
      title="Close the viewer"
      aria-label="Close the viewer"
      @click=${() => {
        this.dispatchEvent(new CustomEvent('close'));
      }}
    >
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        <path
          d="M1 1 9 9M9 1 1 9"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-viewer-close': ViewerCloseElement;
  }
}
