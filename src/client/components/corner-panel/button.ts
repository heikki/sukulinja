import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';

// One of the icon buttons in the chart's top-right corner, beside Settings,
// that opens a panel over the chart and closes it again: the icon is its
// content, `label` names it, and `expanded` says its panel is open. Its
// owner keeps whether it's open, and clicks on it reach the owner as they
// would on any button.
@customElement('sl-corner-button')
class CornerButtonElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: inline-flex;
      }
      :host([hidden]) {
        display: none;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
        background: var(--card);
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: 6px;
        cursor: pointer;
      }
      button:hover,
      button[aria-expanded='true'] {
        color: var(--accent);
        border-color: var(--accent);
      }
      ::slotted(svg) {
        width: 1rem;
        height: 1rem;
      }
    `
  ];

  @property() label = '';

  @property({ type: Boolean }) expanded = false;

  override render() {
    return html`<button
      aria-label=${this.label}
      aria-haspopup="dialog"
      aria-expanded=${this.expanded ? 'true' : 'false'}
    >
      <slot></slot>
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-corner-button': CornerButtonElement;
  }
}
