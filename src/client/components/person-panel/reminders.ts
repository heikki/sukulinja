import { html, nothing } from 'lit';

import type { Reminder } from '@/common/types';

import type { ReminderError } from '../reminder-dialog/actions';

// A person's Reminders as the panel lists them: their own, and each of
// their Citations' by its id, open ones first and done ones after when
// `showDone`; and how many of either are done, shown or not.
export function personReminders(
  all: Reminder[],
  personId: number,
  showDone: boolean
) {
  const mine = all.filter(
    ({ on }) => on.kind !== 'image' && on.personId === personId
  );
  const open = mine.filter((r) => r.done === null);
  const done = mine.filter((r) => r.done !== null);
  const own: Reminder[] = [];
  const byCitation = new Map<number, Reminder[]>();
  for (const r of showDone ? [...open, ...done] : open) {
    const { on } = r;
    if (on.kind === 'person') own.push(r);
    else if (on.kind === 'citation') {
      const listed = byCitation.get(on.citationId) ?? [];
      byCitation.set(on.citationId, [...listed, r]);
    }
  }
  return { own, byCitation, done: done.length };
}

// Reminders, each a button asking for its menu (`menu`) on a click or a
// right-click; a done one dimmed, and one whose change failed saying why.
export function renderReminders(
  reminders: Reminder[],
  error: ReminderError | null,
  menu: (e: MouseEvent, reminder: Reminder) => void
) {
  return html`<ul class="reminders">
    ${reminders.map(
      (r) =>
        html`<li>
          <button
            class=${r.done === null ? 'reminder' : 'reminder done'}
            aria-haspopup="menu"
            @click=${(e: MouseEvent) => {
              menu(e, r);
            }}
            @contextmenu=${(e: MouseEvent) => {
              menu(e, r);
            }}
          >
            ${r.text}
          </button>
          ${
            error?.id === r.id
              ? html`<p class="error">${error.message}</p>`
              : nothing
          }
        </li>`
    )}
  </ul>`;
}
