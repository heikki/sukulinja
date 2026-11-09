import { consume } from '@lit/context';
import { css, html, LitElement, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { goTo } from '@/client/on';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import type { ChangePickEvent } from './index';

import '../corner-panel/button';
import './index';

// A clock face, in currentColor like the buttons beside it.
const CLOCK_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <circle
      cx="8"
      cy="8"
      r="6.25"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M 8 4.5 V 8 L 10.5 9.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `}
</svg>`;

// Beside the Reminders: a clock that opens the list of the dataset's
// Changes, or closes it. Picking one there goes where it was done, asking
// for the dock (`dock-open`) when that's a person or a Citation.
@customElement('sl-changes-button')
class ChangesButtonElement extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private open = false;

  private readonly onPick = (e: ChangePickEvent) => {
    const on = e.detail;
    this.open = false;
    void goTo(this.state, on);
    if (on.kind !== 'image') this.dispatchEvent(new CustomEvent('dock-open'));
  };

  override render() {
    return html`
      <sl-corner-button
        label="Changes"
        ?expanded=${this.open}
        @click=${() => {
          this.open = !this.open;
        }}
      >
        ${CLOCK_ICON}
      </sl-corner-button>
      ${
        this.open
          ? html`<sl-changes-dialog
              @close=${() => {
                this.open = false;
              }}
              @pick=${this.onPick}
            ></sl-changes-dialog>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-changes-button': ChangesButtonElement;
  }
}
