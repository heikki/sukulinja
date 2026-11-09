import { html } from 'lit';

import type { AppState } from '@/client/state';
import type { On, Reminder } from '@/common/types';

import { headerOf } from './header';

// One line of what a Reminder is on, and where clicking it goes; null for
// nowhere.
export interface OnLine {
  text: string;
  to: On | null;
}

// What a Reminder is on, a line each: the person's name, going to them,
// then a Citation's source or an Image, going to it; an Image from an
// earlier filming goes nowhere.
export function onLines(state: AppState, reminder: Reminder): OnLine[] {
  const { on } = reminder;
  const header = headerOf(state, reminder);
  if (on.kind === 'image') {
    const image = { text: header.at(-1) ?? '', to: on.stale ? null : on };
    if (on.personId === null) return [image];
    const about: On = { kind: 'person', personId: on.personId };
    return [{ text: header[0] ?? '', to: about }, image];
  }
  const person: On = { kind: 'person', personId: on.personId };
  const [name = '', where] = header;
  if (on.kind === 'person') return [{ text: name, to: person }];
  return [
    { text: name, to: person },
    { text: where ?? '', to: on }
  ];
}

// The lines, each that goes somewhere a button asking to (`go`, bubbling
// out of the list).
export function renderLines(lines: OnLine[], stale: boolean) {
  return html`<div class="lines">
    ${lines.map(({ text, to }) => {
      if (to === null) {
        return html`<div>
          ${text}${
            stale ? html`<span class="chip">From an earlier filming</span>` : ''
          }
        </div>`;
      }
      return html`<div>
        <button
          class="go"
          title=${text}
          @click=${(e: Event) => {
            e.currentTarget?.dispatchEvent(
              new CustomEvent('go', {
                detail: to,
                bubbles: true,
                composed: true
              })
            );
          }}
        >
          ${text}
        </button>
      </div>`;
    })}
  </div>`;
}
