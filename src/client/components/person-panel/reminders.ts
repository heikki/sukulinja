import { html } from 'lit';

import type { Reminder } from '@/common/types';

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

// Reminders, each a button that opens it (`open`); a done one dimmed.
export function renderReminders(
  reminders: Reminder[],
  open: (reminder: Reminder) => void
) {
  return html`<ul class="reminders">
    ${reminders.map(
      (r) =>
        html`<li>
          <button
            class=${r.done === null ? 'reminder' : 'reminder done'}
            aria-haspopup="dialog"
            @click=${() => {
              open(r);
            }}
          >
            ${r.text}
          </button>
        </li>`
    )}
  </ul>`;
}
