// A pending Entry's fields as typed on its card, and the lines listing
// what they'd do to the tree (ADR-0033): asked of the server as the
// Entry changes, each line ticked as it starts unless its box was
// pressed.

import { signal } from '@lit-labs/signals';

import type { DatasetApi, InEntry } from '@/client/dataset-api';
import {
  gedcomDate,
  isoDate,
  transcribedDate,
  TYPED_DATE_FORMS,
  typedDate
} from '@/common/dates';
import { eventDates, NO_FIELDS } from '@/common/entry-events';
import type { EntryEvent, EntryFields } from '@/common/entry-events';
import { tickedFirst, tickedLine } from '@/common/entry-offers';
import type { Offer, Ticked } from '@/common/entry-offers';
import type { RecordView } from '@/common/types';

import { Latest } from './latest';

// The fields as typed: dates the app's way ("3.3.1761"), '' for none.
export type TypedFields = Record<keyof EntryFields, string>;

export const NO_TYPED: TypedFields = {
  date: '',
  lifeDate: '',
  place: ''
};

// A line by what it does, as its box is kept: "BIRT add".
export function lineKey(line: Offer) {
  const fact = 'factId' in line ? ` ${line.factId}` : '';
  return `${line.tag} ${line.action}${fact}`;
}

// Fields saved, as the card shows them to edit.
export function typedOf(fields: EntryFields | null): TypedFields {
  const { date, lifeDate, place } = fields ?? NO_FIELDS;
  return {
    date: date === null ? '' : gedcomDate(date),
    lifeDate: lifeDate === null ? '' : gedcomDate(lifeDate),
    place: place ?? ''
  };
}

// The labels a MyHeritage record gives each date of an Entry of the
// Event under ("Ristiäiset: 3. Maalis 1795 - Juva, …").
const RECORD_DATES: Partial<
  Record<EntryEvent, Partial<Record<'date' | 'lifeDate', string[]>>>
> = {
  CHR: {
    lifeDate: ['Syntymä', 'Syntymäpäivä', 'Syntymäaika'],
    date: ['Ristiäiset']
  },
  MARR: { date: ['Avioliitto'] },
  BURI: { lifeDate: ['Kuolema', 'Kuolinpäivä'], date: ['Hautaus'] }
};

// Where a household line's record says its people lived, as the book
// writes it: the village and farm number ("Kylämaa", "No. 3" →
// "Kylämaa 3"). Other records name only the parish, which isn't a place.
function recordPlace(event: EntryEvent | null, record: RecordView) {
  if (event !== 'RESI') return '';
  function value(label: string) {
    return record.fields.find((f) => f.label === label)?.value.trim() ?? '';
  }
  const farm = value('Maatila').replace(/^No\.?\s*/i, '');
  return [value('Kylä'), farm].filter((v) => v !== '').join(' ');
}

// The dates a MyHeritage record transcribes of an Entry of the Event, as
// the card types them ("3.3.1795"), and a household line's place; none it
// doesn't give.
export function recordTyped(
  event: EntryEvent | null,
  record: RecordView | null
): TypedFields {
  if (event === null || record === null) return NO_TYPED;
  const labels = RECORD_DATES[event] ?? {};
  const typed = { ...NO_TYPED, place: recordPlace(event, record) };
  for (const { key } of eventDates(event)) {
    const named = labels[key] ?? [];
    const value = record.fields.find((f) => named.includes(f.label))?.value;
    const iso = value === undefined ? null : transcribedDate(value);
    if (iso !== null) typed[key] = isoDate(iso);
  }
  return typed;
}

// A Transcription's "Label: value" lines, as a converted reference's
// record is written into it (ADR-0016), read back as its fields.
export function textRecord(text: string): RecordView {
  const fields = text.split('\n').flatMap((line) => {
    const at = line.indexOf(': ');
    if (at <= 0) return [];
    return [{ label: line.slice(0, at).trim(), value: line.slice(at + 2) }];
  });
  return { name: '', fields, household: [] };
}

// An Entry's fields to edit: as saved, or with none saved, those its
// Transcription gives, so the tree's Facts that agree are offered as
// theirs.
export function editedTyped(
  event: EntryEvent | null,
  saved: EntryFields | null,
  text: string
): TypedFields {
  const typed = typedOf(saved);
  if (Object.values(typed).some((v) => v !== '')) return typed;
  return recordTyped(event, textRecord(text));
}

function cleaned(text: string) {
  const trimmed = text.trim().replaceAll(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

// The fields the Entry of the Event keeps, as GEDCOM writes its dates; a
// date that can't be read left out.
export function fieldsOf(event: EntryEvent | null, typed: TypedFields) {
  const fields: EntryFields = {
    ...NO_FIELDS,
    place: cleaned(typed.place)
  };
  for (const { key } of eventDates(event)) {
    const text = cleaned(typed[key]);
    fields[key] = text === null ? null : typedDate(text);
  }
  return fields;
}

// Why a date typed for the Event can't be saved, by its label; null when
// they all can.
export function datesRefusal(event: EntryEvent | null, typed: TypedFields) {
  const wrong = eventDates(event).find(
    ({ key }) => cleaned(typed[key]) !== null && typedDate(typed[key]) === null
  );
  return wrong === undefined
    ? null
    : `${wrong.label}: write the date as ${TYPED_DATE_FORMS}.`;
}

// The lines to do: those ticked, as they start or as their box was set.
export function tickedOf(
  offers: Offer[],
  ticks: Record<string, boolean>
): Ticked[] {
  return offers.flatMap((o) =>
    o.action !== 'two' && (ticks[lineKey(o)] ?? tickedFirst(o))
      ? [tickedLine(o)]
      : []
  );
}

// What the lines are asked by: the Entry in its Volume.
export interface LinesAsked {
  volumeId: string;
  // The Entry being edited, if it is one.
  entryId?: number;
  event: EntryEvent | null;
  people: InEntry[];
  fields: TypedFields;
}

// The lines for the pending Entry, asked again as it changes; one
// request at a time, the last asked winning.
export function entryLines(api: DatasetApi) {
  const offers = signal<Offer[]>([]);
  const latest = new Latest();
  let last = '';

  function askedOf({ volumeId, entryId, event, people, fields }: LinesAsked) {
    return {
      volumeId,
      ...(entryId === undefined ? {} : { entryId }),
      event,
      people,
      fields: fieldsOf(event, fields)
    };
  }

  // Asks for the Entry's lines, unless they're asked for it already.
  function ask(entry: LinesAsked) {
    const asked = askedOf(entry);
    const key = JSON.stringify(asked);
    if (key === last) return;
    last = key;
    void latest
      .run(async (abort) => await api.entryOffers(asked, abort))
      .then((got) => {
        if (got !== undefined) offers.set(got ?? []);
      });
  }

  // No Entry pending: no lines.
  function clear() {
    latest.stop();
    last = '';
    offers.set([]);
  }

  // The lines to do for the Entry, as it is when saved, by the boxes
  // pressed.
  async function ticked(entry: LinesAsked, ticks: Record<string, boolean>) {
    return tickedOf(await api.entryOffers(askedOf(entry)), ticks);
  }

  return { offers, ask, clear, ticked };
}
