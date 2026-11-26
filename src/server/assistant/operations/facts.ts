// Proposing a Fact added to someone, or what one says changed.

import {
  ADDABLE_FACTS,
  factKindLabel,
  factWords,
  onceOnly
} from '@/common/facts';
import type { FactFields } from '@/common/types';

import type { TreeView } from '../tree-view';
import { writeOperation } from './operation';
import { formFields } from './persons';

const FIELDS =
  'The date is written as the app\'s form takes it: "3.3.1761", "3/1761", "1761", "n. 1761", "ennen 1761", "1761 jälkeen", "1870–1879". The place as the tree writes places ("farm, village, parish, Suomi"); `value` is what an attribute says (an occupation\'s title), and `type` an Event\'s kind ("Muutto").';

// The person's Fact, or their marriage's, by id; null for none.
function factOf(view: TreeView, personId: number, factId: number) {
  const details = view.services.personDetails(personId);
  return details?.facts.find((f) => f.id === factId) ?? null;
}

// Whether the person has a Fact of the kind of their own.
function hasOwn(view: TreeView, personId: number, tag: string) {
  const facts = view.services.personDetails(personId)?.facts ?? [];
  return facts.some((f) => f.familyId === null && f.tag === tag);
}

// The fact as the Proposal names it: its kind, and what it says.
function words(tag: string, type: string, fields: FactFields | null) {
  const kind = type === '' ? factKindLabel(tag) : type;
  if (fields === null) return kind;
  const said = factWords({
    date: null,
    type: null,
    place: fields.place,
    address: fields.address,
    value: fields.value
  });
  const at = [fields.date, said].filter((s) => s !== null && s !== '');
  return at.length === 0 ? kind : `${kind} ${at.join(' · ')}`;
}

interface Add extends FactFields {
  personId: number;
  tag: string;
  familyId: number | null;
  citationIds: number[];
}

// The sources by id among the person's, as the Proposal names them; null
// when one isn't theirs.
function sourcesOf(view: TreeView, personId: number, ids: number[]) {
  const citations = view.services.personDetails(personId)?.citations ?? [];
  const found = ids.map((id) => citations.find((c) => c.id === id));
  if (found.some((c) => c === undefined)) return null;
  return found.map((c) => c!.reference ?? c!.source ?? 'a source');
}

// What adding the fact, and its sources supporting it, says.
function addWords(name: string, said: string, sources: string[]) {
  const by = sources.length === 0 ? '' : `, supported by ${sources.join('; ')}`;
  return `Add to ${name}: ${said}${by}`;
}

export const addFact = writeOperation<Add>({
  name: 'add_fact',
  description: `Proposes adding a fact to a person: one of their own, or, with \`familyId\` (one of the families they're a spouse in), their marriage's (MARR, DIV). A person has one birth, christening, death and burial at most: one they have is changed with edit_fact, not added again. With \`citationIds\`, those of their sources (by id in \`person\`) support it once it's added: a source of a church-book entry only the facts of whom it's about (a baptism's child, a marriage's couple, a burial's or household line's one person). ${FIELDS} Leave a field empty for none.`,
  input: {
    type: 'object',
    properties: {
      personId: { type: 'integer' },
      tag: { type: 'string', enum: ADDABLE_FACTS.map((k) => k.tag) },
      familyId: { type: ['integer', 'null'] },
      date: { type: 'string' },
      place: { type: 'string' },
      address: { type: 'string' },
      value: { type: 'string' },
      type: { type: 'string' },
      citationIds: { type: 'array', items: { type: 'integer' } }
    },
    required: [
      'personId',
      'tag',
      'familyId',
      'date',
      'place',
      'address',
      'value',
      'type',
      'citationIds'
    ],
    additionalProperties: false
  },
  asks(view, { personId, tag, familyId, citationIds, ...fields }) {
    const why = view.unwritable(personId);
    if (why !== null) return { rejected: why };
    if (familyId === null && onceOnly(tag) && hasOwn(view, personId, tag)) {
      const kind = factKindLabel(tag).toLowerCase();
      return {
        rejected: `They have a ${kind} already: change it with edit_fact.`
      };
    }
    const sources = sourcesOf(view, personId, citationIds);
    if (sources === null) return { rejected: 'They have no such source.' };
    const of =
      familyId === null
        ? { scope: 'person' as const, id: personId }
        : { scope: 'family' as const, id: familyId };
    for (const id of citationIds) {
      const refused = view.services.scans.supportRefusal(id, of);
      if (refused !== null) return { rejected: refused };
    }
    const said = words(tag, fields.type, fields);
    return {
      operation: 'addFact',
      body: { personId, fact: { tag, familyId, ...fields } },
      label: addWords(view.nameOf(personId), said, sources),
      // The Fact added answers its id.
      then: citationIds.map((citationId) => ({
        operation: 'support',
        bodyAfter: (factId) => ({ citationId, factId, on: true })
      }))
    };
  },
  many: (n) => `Add ${n} facts`
});

interface Edit {
  personId: number;
  factId: number;
  date: string | null;
  place: string | null;
  address: string | null;
  value: string | null;
  type: string | null;
}

export const editFact = writeOperation<Edit>({
  name: 'edit_fact',
  description: `Proposes changing what one of a person's facts, or their marriage's, says. Each field null stays as it is; an empty string clears it. ${FIELDS}`,
  input: {
    type: 'object',
    properties: {
      personId: { type: 'integer' },
      factId: { type: 'integer' },
      date: { type: ['string', 'null'] },
      place: { type: ['string', 'null'] },
      address: { type: ['string', 'null'] },
      value: { type: ['string', 'null'] },
      type: { type: ['string', 'null'] }
    },
    required: [
      'personId',
      'factId',
      'date',
      'place',
      'address',
      'value',
      'type'
    ],
    additionalProperties: false
  },
  asks(view, { personId, factId, ...changed }) {
    const why = view.unwritable(personId);
    if (why !== null) return { rejected: why };
    const fact = factOf(view, personId, factId);
    if (fact === null) return { rejected: 'They have no such fact.' };
    const was = formFields(fact);
    const fields: FactFields = {
      date: changed.date ?? was.date,
      place: changed.place ?? was.place,
      address: changed.address ?? was.address,
      value: changed.value ?? was.value,
      type: changed.type ?? was.type
    };
    const name = view.nameOf(personId);
    return {
      operation: 'editFact',
      body: { personId, factId, fields },
      label: `Change ${name}'s ${words(fact.tag, was.type, was)} to ${words(fact.tag, fields.type, fields)}`
    };
  },
  many: (n) => `Change ${n} facts`
});
