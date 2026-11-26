// A pending Entry's fields as typed in its Entry pane, and the lines listing
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
import type { EntryLines } from '@/common/operations';
import type { Box, RecordView } from '@/common/types';

import { Latest } from './latest';

// The fields as typed: dates the app's way ("3.3.1761"), '' for none.
export type TypedFields = Record<keyof EntryFields, string>;

export const NO_TYPED: TypedFields = {
  date: '',
  lifeDate: '',
  place: '',
  page: ''
};

// A line by what it does, as its box is kept: "BIRT add".
export function lineKey(line: Offer) {
  const fact = 'factId' in line ? ` ${line.factId}` : '';
  return `${line.tag} ${line.action}${fact}`;
}

// Fields saved, as the Entry pane shows them to edit.
export function typedOf(fields: EntryFields | null): TypedFields {
  const { date, lifeDate, place, page } = fields ?? NO_FIELDS;
  return {
    date: date === null ? '' : gedcomDate(date),
    lifeDate: lifeDate === null ? '' : gedcomDate(lifeDate),
    place: place ?? '',
    page: page === null ? '' : String(page)
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
// "Kylämaa 3"), or a farm named in full as it is ("No. 15 Haukivuori").
// Other records name only the parish, which isn't a place.
function recordPlace(event: EntryEvent | null, record: RecordView) {
  if (event !== 'RESI') return '';
  function value(label: string) {
    return record.fields.find((f) => f.label === label)?.value.trim() ?? '';
  }
  const village = value('Kylä');
  const farm = value('Maatila');
  const number = /^(?:No\.?\s*)?(?<n>\d+(?:\s?[a-z]|[-/]\d+)?)\.?$/i.exec(farm)
    ?.groups?.n;
  if (number !== undefined || farm === '') {
    return [village, number ?? ''].filter((v) => v !== '').join(' ');
  }
  const named =
    village === '' ||
    farm
      .toLowerCase()
      .split(/[\s,]+/)
      .includes(village.toLowerCase());
  return named ? farm : `${village} ${farm}`;
}

// The page number a rippikirja's record gives ("Sivu: 12"), or ''.
function recordPage(record: RecordView) {
  const sivu = record.fields.find((f) => f.label === 'Sivu')?.value ?? '';
  return /^\s*0*(?<n>[1-9]\d{0,5})\s*$/.exec(sivu)?.groups?.n ?? '';
}

// The dates a MyHeritage record transcribes of an Entry of the Event, as
// the Entry pane types them ("3.3.1795"), a household line's place, and
// the page number a rippikirja's gives ("Sivu: 12"); none it doesn't give.
export function recordTyped(
  event: EntryEvent | null,
  record: RecordView | null
): TypedFields {
  if (event === null || record === null) return NO_TYPED;
  const labels = RECORD_DATES[event] ?? {};
  const typed = {
    ...NO_TYPED,
    place: recordPlace(event, record),
    page: recordPage(record)
  };
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
  const { page, ...says } = typed;
  if (Object.values(says).some((v) => v !== '')) return typed;
  const read = recordTyped(event, textRecord(text));
  return page === '' ? read : { ...read, page };
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
    place: cleaned(typed.place),
    page: pageTyped(typed.page) ?? null
  };
  for (const { key } of eventDates(event)) {
    const text = cleaned(typed[key]);
    fields[key] = text === null ? null : typedDate(text);
  }
  return fields;
}

// The page number typed: null for none, undefined for what isn't one.
function pageTyped(text: string) {
  const page = cleaned(text);
  if (page === null) return null;
  return /^[1-9]\d{0,5}$/.test(page) ? Number(page) : undefined;
}

// Why a date typed for the Event, or the page, can't be saved, by its
// label; null when they all can.
export function datesRefusal(event: EntryEvent | null, typed: TypedFields) {
  const wrong = eventDates(event).find(
    ({ key }) => cleaned(typed[key]) !== null && typedDate(typed[key]) === null
  );
  if (wrong !== undefined) {
    return `${wrong.label}: write the date as ${TYPED_DATE_FORMS}.`;
  }
  return pageTyped(typed.page) === undefined
    ? 'Page: write the page as a number.'
    : null;
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
// request at a time, the last asked winning. What's saved is what's shown:
// the lines and the last Change when they were worked out (ADR-0037).
export function entryLines(api: DatasetApi) {
  const offers = signal<Offer[]>([]);
  const latest = new Latest();
  let last = '';
  // The lines shown, by what they were asked for.
  let shown: { key: string; lines: EntryLines } | null = null;
  // Those asked for and not come yet.
  let coming: {
    key: string;
    lines: Promise<EntryLines | null | undefined>;
  } | null = null;

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
    const lines = latest.run(
      async (abort) => await api.entryOffers(asked, abort)
    );
    coming = { key, lines };
    void lines.then((got) => {
      if (got === undefined) return;
      if (coming?.lines === lines) coming = null;
      shown = got === null ? null : { key, lines: got };
      offers.set(got?.offers ?? []);
    });
  }

  // No Entry pending: no lines.
  function clear() {
    latest.stop();
    last = '';
    shown = null;
    coming = null;
    offers.set([]);
  }

  // The lines to do for the Entry, as it is when saved, by the boxes
  // pressed, and the last Change when they were listed: those shown, or
  // coming, or asked now when what's shown was asked for it as it was
  // before.
  async function ticked(entry: LinesAsked, ticks: Record<string, boolean>) {
    const asked = askedOf(entry);
    const key = JSON.stringify(asked);
    const lines =
      (shown?.key === key ? shown.lines : null) ??
      (coming?.key === key ? await coming.lines : null) ??
      (await api.entryOffers(asked));
    return { ticked: tickedOf(lines.offers, ticks), seen: lines.seen };
  }

  return { offers, ask, clear, ticked };
}

// The page written where the Box is, of the pages on its Image: a spread's
// left page or right by which half the Box's middle is in, the left with
// the Image's width unknown; '' with none.
export function pageOfBox(pages: number[], box: Box, width: number | null) {
  if (pages.length === 0) return '';
  const right =
    pages.length > 1 && width !== null && box.left + box.width / 2 > width / 2;
  return String(right ? pages[1] : pages[0]);
}
