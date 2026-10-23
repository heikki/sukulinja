import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Point } from '@/client/pan-zoom';
import type { PersonRow, Reminder } from '@/common/types';

import { placeOf } from '../reminder-dialog/helpers';
import { scanRemindersStyles } from './edit-styles';

function stop(e: Event) {
  e.stopPropagation();
}

export type ReminderMenuEvent = CustomEvent<{ reminder: Reminder; at: Point }>;

// The Reminders on the Image shown, rising from the page nav: each one's
// text, with what it's on beneath. A click or right-click on one asks for
// its menu (`reminder-menu`, at the pointer in client coordinates).
@customElement('sl-scan-reminders')
export class ScanRemindersElement extends LitElement {
  static override styles = scanRemindersStyles;

  @property({ attribute: false }) reminders: Reminder[] = [];
  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  @property({ attribute: false }) here: {
    volumeId: string;
    image: number;
  } | null = null;
  @property({ attribute: false }) error: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    for (const type of ['mousedown', 'wheel', 'dblclick']) {
      this.addEventListener(type, stop);
    }
  }

  private menu(e: MouseEvent, reminder: Reminder) {
    e.preventDefault();
    e.stopPropagation();
    const at: Point = { x: e.clientX, y: e.clientY };
    this.dispatchEvent(
      new CustomEvent('reminder-menu', { detail: { reminder, at } })
    );
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
                      @click=${(e: MouseEvent) => {
                        this.menu(e, r);
                      }}
                      @contextmenu=${(e: MouseEvent) => {
                        this.menu(e, r);
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
      ${this.error === null ? nothing : html`<p class="error">${this.error}</p>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-reminders': ScanRemindersElement;
  }
}
