// The places the tree's Facts name, and the Facts at one.

import { factKindLabel } from '@/common/facts';

import { readOperation } from './operation';

// How many places, or Facts at one, are given at most.
const MAX = 400;

function folded(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export const places = readOperation<{ contains: string | null }>({
  name: 'places',
  description:
    'Every place the tree\'s facts name, exactly as written ("farm, village, parish, Suomi"), with how many facts name it, the most named first. `contains` keeps only places with that text (case and accents ignored); null gives all. Gives at most 400, with how many matched.',
  input: {
    type: 'object',
    properties: { contains: { type: ['string', 'null'] } },
    required: ['contains'],
    additionalProperties: false
  },
  label: (i) =>
    i.contains === null
      ? 'Reading places'
      : `Reading places with ${i.contains}`,
  run(view, { contains }) {
    const want = contains === null ? null : folded(contains);
    const all = view.services.facts
      .placeCounts()
      .filter((p) => want === null || folded(p.place).includes(want));
    return { matched: all.length, places: all.slice(0, MAX) };
  }
});

export const placeFacts = readOperation<{ place: string }>({
  name: 'place_facts',
  description:
    "The facts naming one place, exactly as `places` writes it: each one's kind, date and whose it is. Facts only of people who may be living are left out and counted.",
  input: {
    type: 'object',
    properties: { place: { type: 'string' } },
    required: ['place'],
    additionalProperties: false
  },
  label: (i) => `Reading what happened at ${i.place}`,
  run(view, { place }) {
    let leftOut = 0;
    const facts = view.services.facts.atPlace(place).flatMap((f) => {
      const shown = f.personIds.filter((id) => !view.hidden(id));
      if (shown.length === 0) {
        leftOut += 1;
        return [];
      }
      return [
        {
          kind: f.type ?? factKindLabel(f.tag),
          date: f.date,
          whose: f.personIds.map((id) => view.ref(id))
        }
      ];
    });
    return {
      facts: facts.slice(0, MAX),
      matched: facts.length,
      leftOutAsMaybeLiving: leftOut
    };
  }
});
