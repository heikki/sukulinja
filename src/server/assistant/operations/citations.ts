// Proposing a source to support a Fact: one of the person's Citations
// made to support one of their Facts, or no longer.

import { gedcomDate } from '@/common/dates';
import { factKindLabel } from '@/common/facts';

import type { FactScope } from '../../citations';
import type { TreeView } from '../tree-view';
import { writeOperation } from './operation';

// The person's source and Fact, as the Proposal names them.
function sourceAndFact(
  view: TreeView,
  personId: number,
  citationId: number,
  factId: number
): { source: string; fact: string; of: FactScope } | { rejected: string } {
  const details = view.services.personDetails(personId);
  const citation = details?.citations.find((c) => c.id === citationId);
  if (citation === undefined) return { rejected: 'They have no such source.' };
  const fact = details?.facts.find((f) => f.id === factId);
  if (fact === undefined) return { rejected: 'They have no such fact.' };
  const kind = fact.type ?? factKindLabel(fact.tag);
  const date = fact.date === null ? '' : ` ${gedcomDate(fact.date)}`;
  return {
    source: citation.reference ?? citation.source ?? 'A source',
    fact: `${kind}${date}`,
    of:
      fact.familyId === null
        ? { scope: 'person', id: personId }
        : { scope: 'family', id: fact.familyId }
  };
}

interface Support {
  personId: number;
  citationId: number;
  factId: number;
  supports: boolean;
}

export const supportFact = writeOperation<Support>({
  name: 'support_fact',
  description:
    "Proposes that one of a person's sources (a Citation, by its id in `person`) supports one of their facts or their marriage's; `supports` false proposes it no longer does. Only for a source that says what the fact says; a source of a church-book entry supports only the facts of whom it's about (a baptism's child, a marriage's couple, a burial's or household line's one person).",
  input: {
    type: 'object',
    properties: {
      personId: { type: 'integer' },
      citationId: { type: 'integer' },
      factId: { type: 'integer' },
      supports: { type: 'boolean' }
    },
    required: ['personId', 'citationId', 'factId', 'supports'],
    additionalProperties: false
  },
  asks(view, { personId, citationId, factId, supports }) {
    const why = view.unwritable(personId);
    if (why !== null) return { rejected: why };
    const found = sourceAndFact(view, personId, citationId, factId);
    if ('rejected' in found) return found;
    const refused = supports
      ? view.services.scans.supportRefusal(citationId, found.of)
      : null;
    if (refused !== null) return { rejected: refused };
    const of = `${view.nameOf(personId)}'s ${found.fact}`;
    return {
      operation: 'support',
      body: { citationId, factId, on: supports },
      label: supports
        ? `${found.source} supports ${of}`
        : `${found.source} no longer supports ${of}`
    };
  },
  many: (n) => `Sources for ${n} facts`
});
