// An Entry's dates, place and page number as stored (ADR-0033, ADR-0039):
// only the dates its Event gives, each a date the app can read; the page
// a whole number, as entryFieldsOf reads it.

import { gedcomDate, typedDate } from '@/common/dates';
import { eventDates } from '@/common/entry-events';
import type { EntryEvent, EntryFields } from '@/common/entry-events';

// A field with something in it, trimmed; null for none.
function said(value: string | null) {
  const kept = value?.trim() ?? '';
  return kept === '' ? null : kept;
}

// The fields an Entry of the Event keeps: its own dates, its place and
// page number. A date of another Event's, left from a kind chosen before,
// goes.
export function keptFields(
  event: EntryEvent | null,
  fields: EntryFields
): EntryFields {
  const keys = new Set(eventDates(event).map((d) => d.key));
  return {
    date: keys.has('date') ? said(fields.date) : null,
    lifeDate: keys.has('lifeDate') ? said(fields.lifeDate) : null,
    place: said(fields.place),
    page: fields.page
  };
}

// Why the fields can't be stored: a date the app can't read back, as
// GEDCOM writes one. Null when they can.
export function fieldsRefusal(fields: EntryFields) {
  for (const date of [fields.date, fields.lifeDate]) {
    if (date !== null && typedDate(gedcomDate(date)) !== date) {
      return `"${date}" isn't a date the Entry pane can write.`;
    }
  }
  return null;
}
