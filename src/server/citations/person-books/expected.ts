// A person's Expected entries: which kinds of church book should hold
// them, in which years, by what their Facts say. Read from the Facts
// alone; where the Books are is `fits.ts`'s.

import { dateSpan } from '@/common/dates';
import type { ExpectedEntry, FactRow, Years } from '@/common/types';

// How long a child is in the lastenkirjat: until confirmation, around 15.
const CHILDHOOD_YEARS = 15;

const BIRTH = ['BIRT'];
const BAPTISM = ['CHR', 'BAPM'];
const DEATH = ['DEAT'];
const BURIAL = ['BURI', 'CREM'];

// The year of a day as dateSpan numbers it; null for an open end.
function yearOfDay(day: number) {
  return Number.isFinite(day) ? Math.floor(day / 10000) : null;
}

// The years a GEDCOM date can be in; one side's year for a date only
// bounded on one side ("BEF 1761"); null when it can't be read.
export function yearsOf(date: string | null): Years | null {
  const span = date === null ? null : dateSpan(date);
  if (span === null) return null;
  const first = yearOfDay(span[0]);
  const last = yearOfDay(span[1]);
  const from = first ?? last;
  const to = last ?? first;
  return from === null || to === null ? null : { from, to };
}

interface Dated {
  fact: FactRow;
  years: Years;
}

function dated(facts: FactRow[]): Dated[] {
  return facts.flatMap((fact) => {
    const years = yearsOf(fact.date);
    return years === null ? [] : [{ fact, years }];
  });
}

// The first dated Fact of the tags, in their order.
function firstOf(all: Dated[], ...tags: string[][]) {
  for (const group of tags) {
    const found = all.find((d) => group.includes(d.fact.tag));
    if (found !== undefined) return found;
  }
  return null;
}

// The places, once each, as written, those of `first` first.
function placesOf(first: FactRow[], rest: FactRow[] = []) {
  const all = [...first, ...rest].flatMap((f) =>
    f.place === null || f.place.trim() === '' ? [] : [f.place.trim()]
  );
  return [...new Set(all)];
}

function overlaps(a: Years, b: Years) {
  return a.from <= b.to && b.from <= a.to;
}

// Where the person lived in the years: their residences then.
function residencesIn(all: Dated[], years: Years) {
  return all
    .filter((d) => d.fact.tag === 'RESI' && overlaps(d.years, years))
    .map((d) => d.fact);
}

function baptism(all: Dated[], birth: Dated | null): ExpectedEntry[] {
  const own = firstOf(all, BAPTISM) ?? birth;
  if (own === null) return [];
  const facts = [own.fact, ...(birth === null ? [] : [birth.fact])];
  return [
    {
      kind: 'kastetut',
      of: 'birth',
      years: own.years,
      estimated: false,
      places: placesOf(facts)
    }
  ];
}

function childhood(all: Dated[], birth: Dated | null): ExpectedEntry[] {
  if (birth === null) return [];
  const years = {
    from: birth.years.from,
    to: birth.years.to + CHILDHOOD_YEARS
  };
  return [
    {
      kind: 'lasten',
      of: 'childhood',
      years,
      estimated: false,
      places: placesOf([birth.fact], residencesIn(all, years))
    }
  ];
}

// From birth to death; failing either, from or to the furthest year any
// Fact gives.
function life(
  all: Dated[],
  birth: Dated | null,
  death: Dated | null
): ExpectedEntry[] {
  if (all.length === 0) return [];
  const years = {
    from: birth?.years.from ?? Math.min(...all.map((d) => d.years.from)),
    to: death?.years.to ?? Math.max(...all.map((d) => d.years.to))
  };
  const others = all.map((d) => d.fact);
  return [
    {
      kind: 'rippi',
      of: 'life',
      years,
      estimated: birth === null || death === null,
      places: placesOf(residencesIn(all, years), others)
    }
  ];
}

function marriages(all: Dated[]): ExpectedEntry[] {
  return all
    .filter((d) => d.fact.tag === 'MARR')
    .map((d) => ({
      kind: 'vihityt' as const,
      of: 'marriage' as const,
      years: d.years,
      estimated: false,
      places: placesOf([d.fact])
    }));
}

function burial(all: Dated[]): ExpectedEntry[] {
  const own = firstOf(all, BURIAL, DEATH);
  if (own === null) return [];
  const death = firstOf(all, DEATH);
  const facts = [own.fact, ...(death === null ? [] : [death.fact])];
  return [
    {
      kind: 'haudatut',
      of: 'death',
      years: own.years,
      estimated: false,
      places: placesOf(facts)
    }
  ];
}

// The person's Expected entries, in the order of their life: baptism,
// childhood, life, each marriage, burial. Facts with no date that can be
// read say nothing of when.
export function expectedEntries(facts: FactRow[]): ExpectedEntry[] {
  const all = dated(facts);
  const birth = firstOf(all, BIRTH, BAPTISM);
  const death = firstOf(all, DEATH, BURIAL);
  return [
    ...baptism(all, birth),
    ...childhood(all, birth),
    ...life(all, birth, death),
    ...marriages(all),
    ...burial(all)
  ];
}
