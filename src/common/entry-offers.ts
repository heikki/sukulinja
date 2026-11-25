// What an Entry would do to the tree (ADR-0033): for each of its dates,
// against the Fact of that kind of its owner (a baptism's child), a line
// on its card with its own box. Never required: adding and supporting
// start ticked, changing unticked. Worked out anew from the Entry and the
// tree as they are, so nothing of it is kept.

import { dateSpan, gedcomDate } from './dates';
import { eventDates } from './entry-events';
import type { EntryEvent, EntryFields } from './entry-events';
import { factKindLabel } from './facts';
import type { Years } from './types';

// A Fact as the Entry is held to it; `supported` when the Entry being
// edited is one of its sources already.
export interface OwnFact {
  id: number;
  tag: string;
  date: string | null;
  place: string | null;
  supported?: boolean;
}

// What a Fact says, its date and place.
export interface FactSays {
  date: string | null;
  place: string | null;
}

// One line of the card's list:
// - 'add': there's no such Fact; one is added, as the Entry says;
// - 'support': the Fact (`was`) agrees; the Entry's Citation supports it.
//   `kept` when the Entry being edited supports it already, agreeing or
//   not: left ticked it still does, unticked it no longer does;
// - 'change': the Fact says less, or differs; it's made to say what the
//   Entry does (`now`), and supported;
// - 'two': there are two or more, none the Entry supports or agrees
//   with; no box. Of two or more, each it supports is kept and each that
//   agrees offered support, by its `factId`.
export type Offer =
  | { tag: string; action: 'add'; now: FactSays }
  | {
      tag: string;
      action: 'support';
      factId: number;
      was: FactSays;
      kept?: true;
    }
  | {
      tag: string;
      action: 'change';
      factId: number;
      was: FactSays;
      now: FactSays;
    }
  | { tag: string; action: 'two' };

// A line ticked to be done, as the card sends it: by its Fact too, where
// it has one, as two of a kind may each have a line. One without
// `factId` is any line of its tag and action.
export interface Ticked {
  tag: string;
  action: 'add' | 'support' | 'change';
  factId?: number;
}

// The line as it's ticked.
export function tickedLine(offer: Exclude<Offer, { action: 'two' }>): Ticked {
  const { tag, action } = offer;
  return 'factId' in offer
    ? { tag, action, factId: offer.factId }
    : { tag, action };
}

// Whether the line ticked is this one.
export function isLine(offer: Offer, t: Ticked) {
  if (offer.tag !== t.tag || offer.action !== t.action) return false;
  return (
    t.factId === undefined || ('factId' in offer && offer.factId === t.factId)
  );
}

// Whether a line starts ticked: adding and supporting do, changing doesn't.
export function tickedFirst(offer: Offer) {
  return offer.action === 'add' || offer.action === 'support';
}

// How the Entry's date stands to the Fact's: the same, within it (the
// Fact says less: 1761 for 3.3.1761), not given by the Fact, or another.
function dateTo(entry: string, fact: string | null) {
  if (fact === null) return 'none';
  if (fact === entry) return 'same';
  const e = dateSpan(entry);
  const f = dateSpan(fact);
  if (e === null || f === null) return 'other';
  return e[0] >= f[0] && e[1] <= f[1] ? 'within' : 'other';
}

// How the Entry's place stands to the Fact's: the same (or the Entry has
// none), not given by the Fact, or another.
function placeTo(entry: string | null, fact: string | null) {
  if (entry === null || entry === fact) return 'same';
  return fact === null ? 'none' : 'other';
}

// Supporting the Fact: kept where the Entry being edited supports it.
function supportOf(tag: string, fact: OwnFact): Offer {
  const was = { date: fact.date, place: fact.place };
  return fact.supported === true
    ? { tag, action: 'support', factId: fact.id, was, kept: true }
    : { tag, action: 'support', factId: fact.id, was };
}

// Whether the Fact may say what the Entry does: neither its date nor its
// place another.
function agrees(now: { date: string; place: string | null }, fact: OwnFact) {
  return (
    dateTo(now.date, fact.date) !== 'other' &&
    placeTo(now.place, fact.place) !== 'other'
  );
}

// The lines for one of the Entry's dates against the Facts of its kind:
// none, add; one, or of two or more the one it supports already with no
// other agreeing, `oneFact`'s; else each it supports kept, each other
// that agrees supported, and none to tick when there's neither.
function offersFor(
  tag: string,
  now: { date: string; place: string | null },
  facts: OwnFact[]
): Offer[] {
  const ofTag = facts.filter((f) => f.tag === tag);
  const own = ofTag.filter((f) => f.supported === true);
  const others = ofTag.filter((f) => f.supported !== true && agrees(now, f));
  const [only, ...more] = ofTag;
  if (only === undefined) return [{ tag, action: 'add', now }];
  if (more.length === 0) return oneFact(tag, now, only);
  if (own.length === 1 && others.length === 0) {
    return oneFact(tag, now, own[0]!);
  }
  const lines = [...own, ...others].map((f) => supportOf(tag, f));
  return lines.length === 0 ? [{ tag, action: 'two' }] : lines;
}

// The lines for one of the Entry's dates against the one Fact of its kind
// it's held to: one that differs, change, kept as a source too if it is
// one; one that agrees, support, and change too where it says less.
function oneFact(
  tag: string,
  now: { date: string; place: string | null },
  fact: OwnFact
): Offer[] {
  const date = dateTo(now.date, fact.date);
  const place = placeTo(now.place, fact.place);
  const was = { date: fact.date, place: fact.place };
  const change: Offer = {
    tag,
    action: 'change',
    factId: fact.id,
    was,
    now: { date: now.date, place: now.place ?? fact.place }
  };
  const support = supportOf(tag, fact);
  if (date === 'other' || place === 'other') {
    return fact.supported === true ? [support, change] : [change];
  }
  return date === 'same' && place === 'same' ? [support] : [support, change];
}

// What the Entry of the Event would do to its owner's Facts: a line for
// each date of its `fields`, at its place as a Fact's (null for none); a
// household line's Residence over its Volume's `years`; and kept, each
// the Entry being edited supports that none of those name.
export function entryOffers(
  event: EntryEvent | null,
  {
    fields,
    place,
    years = null
  }: { fields: EntryFields; place: string | null; years?: Years | null },
  facts: OwnFact[]
): Offer[] {
  const offers =
    event === 'RESI'
      ? residenceOffers(place, years, facts)
      : eventDates(event).flatMap(({ key, tag }) => {
          const date = fields[key];
          return date === null ? [] : offersFor(tag, { date, place }, facts);
        });
  return [...offers, ...keptBesides(offers, facts)];
}

// Those the Entry being edited supports that no line names, as when its
// date was emptied or its kind changed: kept, to untick.
function keptBesides(offers: Offer[], facts: OwnFact[]): Offer[] {
  const named = new Set(
    offers.flatMap((o) => ('factId' in o ? [o.factId] : []))
  );
  return facts
    .filter((f) => f.supported === true && !named.has(f.id))
    .map((f) => supportOf(f.tag, f));
}

// Whether a Fact's date may fall in the years: one it doesn't give may.
function overlaps(date: string | null, years: Years) {
  if (date === null) return true;
  const span = dateSpan(date);
  if (span === null) return false;
  return span[0] <= years.to * 10000 + 1231 && span[1] >= years.from * 10000;
}

// A household line's Residence. One the Entry being edited supports
// already, whatever its years, is kept as its source, and offered its
// place back where it was moved in the tree, unless another at the place
// in the years agrees: that one is offered support instead. With none
// of its own, one at the same place in the years is supported, else one
// is added, from the Volume's first year to its last. None without a
// place or years.
function residenceOffers(
  place: string | null,
  years: Years | null,
  facts: OwnFact[]
): Offer[] {
  if (place === null || years === null) return [];
  const resi = facts.filter((f) => f.tag === 'RESI');
  const own = resi.filter((f) => f.supported === true);
  const same = resi.find(
    (f) => f.supported !== true && f.place === place && overlaps(f.date, years)
  );
  const kept = own.map((f) => supportOf('RESI', f));
  if (same !== undefined) return [...kept, supportOf('RESI', same)];
  if (own.some((f) => f.place === place)) return kept;
  const [moved] = own;
  if (moved !== undefined) {
    const was = { date: moved.date, place: moved.place };
    const now = { date: moved.date, place };
    return [
      ...kept,
      { tag: 'RESI', action: 'change', factId: moved.id, was, now }
    ];
  }
  const span = `BET ${years.from} AND ${years.to}`;
  return [{ tag: 'RESI', action: 'add', now: { date: span, place } }];
}

// The Entry's place as a Fact's is written (ADR-0024): as its book writes
// it, in its parish, in Finland: "Esimerkkilä 2, Juva, Suomi". One typed
// with a comma says where it is itself, and is taken as written. Null
// with none.
export function entryPlace(fields: EntryFields, parish: string | null) {
  const { place } = fields;
  if (place === null || place.includes(',')) return place;
  return [place, parish, 'Suomi'].filter((p) => p !== null).join(', ');
}

function dateWords(date: string | null) {
  return date === null ? 'no date' : gedcomDate(date);
}

// What changes of the Fact: its date and its place, each where it does.
function changeWords(was: FactSays, now: FactSays) {
  const parts = [];
  if (was.date !== now.date) {
    parts.push(`${dateWords(was.date)} → ${dateWords(now.date)}`);
  }
  if (was.place !== now.place) {
    parts.push(
      was.place === null
        ? `at ${now.place}`
        : `place ${was.place} → ${now.place}`
    );
  }
  return parts.join(', ');
}

// A line as its card writes it: "Add Birth 3.3.1761 at Esimerkkilä 2, …",
// "Christening 5.3.1761 matches: use as its source", "Birth 1762: keep as
// its source", "Change Birth 1761 → 3.3.1761", "Two Births:
// none matches".
export function offerWords(offer: Offer) {
  const kind = factKindLabel(offer.tag);
  switch (offer.action) {
    case 'add': {
      const { date, place } = offer.now;
      const at = place === null ? '' : ` at ${place}`;
      return `Add ${kind} ${dateWords(date)}${at}`;
    }
    case 'support': {
      const date =
        offer.was.date === null ? '' : ` ${dateWords(offer.was.date)}`;
      return offer.kept === true
        ? `${kind}${date}: keep as its source`
        : `${kind}${date} matches: use as its source`;
    }
    case 'change':
      return `Change ${kind} ${changeWords(offer.was, offer.now)}`;
    case 'two':
      return `Two ${kind}s: none matches`;
  }
}
