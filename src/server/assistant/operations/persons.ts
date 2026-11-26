// Finding people, and one person with their family and sources; proposing
// a person's name changed, or them moved to another family.

import { gedcomDate } from '@/common/dates';
import { factKindLabel, factWords } from '@/common/facts';
import type { CitationRow, FactFields, FactRow } from '@/common/types';

import { LEFT_OUT, nameOf } from '../tree-view';
import type { TreeView } from '../tree-view';
import { readOperation, writeOperation } from './operation';

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

// What a Fact says, as the app's form shows it and a write takes it: the
// date the Finnish way, empty for none. A value of "Y" is GEDCOM's flag
// that it happened, not text.
export function formFields(f: FactRow): FactFields {
  return {
    date: f.date === null ? '' : gedcomDate(f.date),
    place: f.place ?? '',
    address: f.address ?? '',
    value: f.value === null || f.value === 'Y' ? '' : f.value,
    type: f.type ?? ''
  };
}

function sourceOf(c: CitationRow) {
  const text =
    c.record === null
      ? c.text
      : c.record.fields.map((f) => `${f.label}: ${f.value}`).join('\n');
  return {
    id: c.id,
    source: c.reference ?? c.source,
    entry: c.entry ?? c.page,
    text: text === null ? null : text.slice(0, MAX_TEXT),
    supportsFacts: c.supports,
    // Placed on its church-book page in the app, as an Entry.
    markedInApp: c.entryId !== null
  };
}

// The person's parents, spouses and children, and the families they're
// in, by id, as a child and as a spouse.
function relativesOf(view: TreeView, id: number) {
  const parents: number[] = [];
  const spouses: number[] = [];
  const children: number[] = [];
  const asChild: number[] = [];
  const asSpouse: number[] = [];
  for (const f of view.families) {
    const couple = [f.husband_id, f.wife_id].filter((p) => p !== null);
    if (f.child_ids.includes(id)) {
      parents.push(...couple);
      asChild.push(f.id);
    }
    if (couple.includes(id)) {
      spouses.push(...couple.filter((p) => p !== id));
      children.push(...f.child_ids);
      asSpouse.push(f.id);
    }
  }
  return {
    parents: parents.map((r) => view.ref(r)),
    spouses: spouses.map((r) => view.ref(r)),
    children: children.map((r) => view.ref(r)),
    familiesAsChild: asChild,
    familiesAsSpouse: asSpouse
  };
}

export const person = readOperation<{ id: number }>({
  name: 'person',
  description:
    "One person by id: their events and facts (with each one's id, kind, tag, family id for a marriage's, and its date, place, address, value and type as the app's form shows them), parents, spouses, children, the ids of the families they're a child and a spouse in, and sources (the Citations, with each one's id, what it transcribes, whether it's placed on its church-book page in the app, and the ids of the facts it supports). Someone who may be living is given only when they're the person on screen.",
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
        tag: f.tag,
        familyId: f.familyId,
        says: factWords(f),
        ...formFields(f),
        withSpouse: f.spouse
      })),
      ...relativesOf(view, id),
      sources: details.citations.map(sourceOf)
    };
  }
});

interface Rename {
  personId: number;
  given: string;
  surname: string;
}

export const renamePerson = writeOperation<Rename>({
  name: 'rename_person',
  description:
    "Proposes changing a person's name: their given names and surname, as the app's form takes them. Their sex stays as it is.",
  input: {
    type: 'object',
    properties: {
      personId: { type: 'integer' },
      given: { type: 'string' },
      surname: { type: 'string' }
    },
    required: ['personId', 'given', 'surname'],
    additionalProperties: false
  },
  asks(view, { personId, given, surname }) {
    const why = view.unwritable(personId);
    if (why !== null) return { rejected: why };
    const sex = view.services.personDetails(personId)?.sex ?? 'U';
    const now = nameOf({ given, surname });
    return {
      operation: 'editPerson',
      body: { personId, name: { given, surname, sex } },
      label: `Rename ${view.nameOf(personId)} as ${now}`
    };
  }
});

interface Move {
  personId: number;
  fromFamilyId: number;
  toFamilyId: number;
}

// A family, by its spouses' names.
function familyWords(view: TreeView, familyId: number) {
  const f = view.families.find((x) => x.id === familyId);
  if (f === undefined) return `family ${familyId}`;
  const couple = [f.husband_id, f.wife_id].filter((p) => p !== null);
  return couple.length === 0
    ? `family ${familyId}`
    : `the family of ${couple.map((p) => view.nameOf(p)).join(' and ')}`;
}

export const movePerson = writeOperation<Move>({
  name: 'move_person',
  description:
    'Proposes moving a person from one family to another, as a child or as a spouse, as they are in the first: a child put with the right parents, or a spouse in the right marriage. Families by the ids `person` gives. The app refuses a move that would cut someone off from the tree.',
  input: {
    type: 'object',
    properties: {
      personId: { type: 'integer' },
      fromFamilyId: { type: 'integer' },
      toFamilyId: { type: 'integer' }
    },
    required: ['personId', 'fromFamilyId', 'toFamilyId'],
    additionalProperties: false
  },
  asks(view, { personId, fromFamilyId, toFamilyId }) {
    const why = view.unwritable(personId);
    if (why !== null) return { rejected: why };
    const to = view.families.find((f) => f.id === toFamilyId);
    if (to === undefined) return { rejected: 'No such family.' };
    const couple = [to.husband_id, to.wife_id].filter((p) => p !== null);
    const hidden = couple.find((p) => view.hidden(p));
    if (hidden !== undefined) {
      return { rejected: `That family has ${LEFT_OUT}.` };
    }
    return {
      operation: 'move',
      body: { personId, from: fromFamilyId, to: { familyId: toFamilyId } },
      label: `Move ${view.nameOf(personId)} from ${familyWords(view, fromFamilyId)} to ${familyWords(view, toFamilyId)}`
    };
  }
});
