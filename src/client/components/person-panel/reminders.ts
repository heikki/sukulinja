import { html, nothing } from 'lit';

import type { Reminder } from '@/common/types';

// A person's Reminders as the panel lists them, on them or their
// Citations: open ones, and done ones after with `showDone`; and how many
// are done, shown or not.
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
  return { listed: showDone ? [...open, ...done] : open, done: done.length };
}

// The source a Citation's Reminder is on, as written; null for one on the
// person.
export function sourceOf(reminder: Reminder) {
  const { on } = reminder;
  if (on.kind !== 'citation') return null;
  return on.reference ?? on.source ?? 'Source';
}

// Reminders, each a button that opens it (`open`), a Citation's naming its
// source beneath; a done one dimmed.
export function renderReminders(
  reminders: Reminder[],
  open: (reminder: Reminder) => void
) {
  return html`<ul class="reminders">
    ${reminders.map((r) => {
      const source = sourceOf(r);
      return html`<li>
        <button
          class=${r.done === null ? 'reminder' : 'reminder done'}
          aria-haspopup="dialog"
          @click=${() => {
            open(r);
          }}
        >
          <span class="lines">
            <span class="text">${r.text}</span>
            ${
              source === null
                ? nothing
                : html`<span class="source">${source}</span>`
            }
          </span>
        </button>
      </li>`;
    })}
  </ul>`;
}
