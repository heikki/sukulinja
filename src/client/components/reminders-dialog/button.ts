import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing, svg } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';

import { follow, openCount } from './helpers';
import type { ReminderPickEvent } from './index';

import './index';

// A flag on its pole, in currentColor like the gear beside it.
const FLAG_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 4 14.5 V 2 M 4 2.75 H 12.5 L 10.75 5.5 L 12.5 8.25 H 4"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `}
</svg>`;

// Beside Settings, once the dataset has any Reminders: a flag that opens
// the list of every one. Picking one there goes to it, asking for the dock
// (`dock-open`) when it's a person's or a Citation's, and opens it in its
// dialog over what it's on.
@customElement('sl-reminders-button')
export class RemindersButtonElement extends SignalWatcher(LitElement) {
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
      svg {
        width: 1rem;
        height: 1rem;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private open = false;

  override connectedCallback() {
    super.connectedCallback();
    this.state.reminders.load();
  }

  private readonly onPick = (e: ReminderPickEvent) => {
    const reminder = e.detail;
    this.open = false;
    void follow(this.state, reminder);
    this.state.reminders.show(reminder.id);
    if (reminder.on.kind === 'image') return;
    this.dispatchEvent(new CustomEvent('dock-open'));
  };

  // Hidden until there's a Reminder, open or done.
  override willUpdate() {
    const all = this.state.reminders.all.get();
    this.hidden = !Array.isArray(all) || all.length === 0;
  }

  override render() {
    const count = openCount(this.state.reminders.all.get()) ?? 0;
    const label =
      count === 1 ? 'Reminders, 1 open' : `Reminders, ${count} open`;
    return html`
      <button
        aria-label=${label}
        aria-haspopup="dialog"
        aria-expanded=${this.open ? 'true' : 'false'}
        @click=${() => {
          this.open = true;
        }}
      >
        ${FLAG_ICON}
      </button>
      ${
        this.open
          ? html`<sl-reminders-dialog
              @close=${() => {
                this.open = false;
              }}
              @pick=${this.onPick}
            ></sl-reminders-dialog>`
          : nothing
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-reminders-button': RemindersButtonElement;
  }
}
