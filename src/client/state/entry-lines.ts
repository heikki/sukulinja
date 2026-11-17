// A pending Entry's fields as typed on its card, and the lines listing
// what they'd do to the tree (ADR-0033): asked of the server as the
// Entry changes, each line ticked as it starts unless its box was
// pressed.

import { signal } from '@lit-labs/signals';

import type { DatasetApi, InEntry } from '@/client/dataset-api';
import { gedcomDate, TYPED_DATE_FORMS, typedDate } from '@/common/dates';
import { eventDates, NO_FIELDS } from '@/common/entry-events';
import type { EntryEvent, EntryFields } from '@/common/entry-events';
import { tickedFirst } from '@/common/entry-offers';
import type { Offer, Ticked } from '@/common/entry-offers';

import { Latest } from './latest';

// The fields as typed: dates the app's way ("3.3.1761"), '' for none.
export type TypedFields = Record<keyof EntryFields, string>;

export const NO_TYPED: TypedFields = {
  date: '',
  lifeDate: '',
  place: ''
};

// A line by what it does, as its box is kept: "BIRT add".
export function lineKey(line: { tag: string; action: string }) {
  return `${line.tag} ${line.action}`;
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
      ? [{ tag: o.tag, action: o.action }]
      : []
  );
}

// What the lines are asked by: the Entry in its Volume.
export interface LinesAsked {
  volumeId: string;
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

  function askedOf({ volumeId, event, people, fields }: LinesAsked) {
    return { volumeId, event, people, fields: fieldsOf(event, fields) };
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
