import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { PersonRow, Reminder } from '@/common/types';

import { placeOf } from '../reminder-dialog/helpers';
import { scanRemindersStyles } from './edit-styles';

function stop(e: Event) {
  e.stopPropagation();
}

export type ReminderOpenEvent = CustomEvent<Reminder>;

// The Reminders on the Image shown, rising from the page nav: each one's
// text, with what it's on beneath. Clicking one asks to open it
// (`reminder-open`).
@customElement('sl-scan-reminders')
export class ScanRemindersElement extends LitElement {
  static override styles = scanRemindersStyles;

  @property({ attribute: false }) reminders: Reminder[] = [];
  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  @property({ attribute: false }) here: {
    volumeId: string;
    image: number;
  } | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick']) {
      this.addEventListener(type, stop);
    }
  }

  private open(reminder: Reminder) {
    this.dispatchEvent(new CustomEvent('reminder-open', { detail: reminder }));
  }

  override render() {
    return html`
      <h3>Reminders</h3>
      ${
        this.reminders.length === 0
          ? html`<p class="muted">None open here.</p>`
          : html`<ul>
              ${this.reminders.map(
                (r) =>
                  html`<li>
                    <button
                      aria-haspopup="dialog"
                      @click=${() => {
                        this.open(r);
                      }}
                    >
                      <span class="text">${r.text}</span>
                      <span class="on"
                        >${placeOf(r.on, this.persons, this.here ?? undefined)}</span
                      >
                    </button>
                  </li>`
              )}
            </ul>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-reminders': ScanRemindersElement;
  }
}
