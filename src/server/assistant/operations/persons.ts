// Finding people, and one person with their family and sources.

import { factKindLabel, factWords } from '@/common/facts';
import type { CitationRow } from '@/common/types';

import { LEFT_OUT, nameOf } from '../tree-view';
import type { TreeView } from '../tree-view';
import { readOperation } from './operation';

// How many people a search gives at most.
const MAX_FOUND = 50;
// How much of a Citation's text is given.
const MAX_TEXT = 1500;

interface Find {
  name: string | null;
  bornFrom: number | null;
  bornTo: number | null;
}

function folded(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export const findPersons = readOperation<Find>({
  name: 'find_persons',
  description:
    'Finds people in the tree by name and birth years. Every word of `name` must appear in the name (case and accents ignored); null leaves it out. Gives at most 50, with how many matched. People who may be living are left out and only counted.',
  input: {
    type: 'object',
    properties: {
      name: { type: ['string', 'null'], description: 'Words of the name' },
      bornFrom: { type: ['integer', 'null'], description: 'Born in or after' },
      bornTo: { type: ['integer', 'null'], description: 'Born in or before' }
    },
    required: ['name', 'bornFrom', 'bornTo'],
    additionalProperties: false
  },
  label: (i) =>
    i.name === null ? 'Finding people' : `Finding people named ${i.name}`,
  run(view, i) {
    const words = folded(i.name ?? '')
      .split(/\s+/u)
      .filter((w) => w !== '');
    let leftOut = 0;
    const found = [...view.persons.values()].filter((p) => {
      const name = folded(nameOf(p));
      if (!words.every((w) => name.includes(w))) return false;
      const born = p.birth_year;
      if (i.bornFrom !== null && (born === null || born < i.bornFrom)) {
        return false;
      }
      if (i.bornTo !== null && (born === null || born > i.bornTo)) {
        return false;
      }
      if (view.hidden(p.id)) {
        leftOut += 1;
        return false;
      }
      return true;
    });
    return {
      matched: found.length,
      people: found.slice(0, MAX_FOUND).map((p) => view.ref(p.id)),
      leftOutAsMaybeLiving: leftOut
    };
  }
});

function sourceOf(c: CitationRow) {
  const text =
    c.record === null
      ? c.text
      : c.record.fields.map((f) => `${f.label}: ${f.value}`).join('\n');
  return {
    source: c.reference ?? c.source,
    entry: c.entry ?? c.page,
    text: text === null ? null : text.slice(0, MAX_TEXT),
    supportsFacts: c.supports
  };
}

// The person's parents, spouses and children, by family.
function relativesOf(view: TreeView, id: number) {
  const parents: number[] = [];
  const spouses: number[] = [];
  const children: number[] = [];
  for (const f of view.families) {
    const couple = [f.husband_id, f.wife_id].filter((p) => p !== null);
    if (f.child_ids.includes(id)) parents.push(...couple);
    if (couple.includes(id)) {
      spouses.push(...couple.filter((p) => p !== id));
      children.push(...f.child_ids);
    }
  }
  return {
    parents: parents.map((r) => view.ref(r)),
    spouses: spouses.map((r) => view.ref(r)),
    children: children.map((r) => view.ref(r))
  };
}

export const person = readOperation<{ id: number }>({
  name: 'person',
  description:
    "One person by id: their events and facts (with each one's id, kind, date, place and what it says), parents, spouses, children, and sources (the Citations, with what each transcribes and the ids of the facts it supports). Someone who may be living is given only when they're the person on screen.",
  input: {
    type: 'object',
    properties: { id: { type: 'integer' } },
    required: ['id'],
    additionalProperties: false
  },
  label: (i) => `Reading person ${i.id}`,
  run(view, { id }) {
    if (!view.persons.has(id)) return { error: 'No such person.' };
    if (view.hidden(id)) return { error: `This is ${LEFT_OUT}.` };
    const details = view.services.personDetails(id);
    if (details === null) return { error: 'No such person.' };
    return {
      ...(view.ref(id) as object),
      sex: details.sex,
      facts: details.facts.map((f) => ({
        id: f.id,
        kind: f.type ?? factKindLabel(f.tag),
        says: factWords(f),
        date: f.date,
        place: f.place,
        withSpouse: f.spouse
      })),
      ...relativesOf(view, id),
      sources: details.citations.map(sourceOf)
    };
  }
});
