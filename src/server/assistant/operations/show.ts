// Moving what the person sees, on their behalf: selecting someone, so the
// chart is built around them, or opening one of their sources in the Scan
// viewer. Neither changes data, so neither waits for the person.

import type { TreeView } from '../tree-view';
import { showOperation } from './operation';

// Why the person can't be shown: not in the tree, or left out; null when
// they can.
function unshowable(view: TreeView, id: number) {
  if (!view.persons.has(id)) return 'No such person.';
  return view.hidden(id) ? view.unwritable(id) : null;
}

// The person by name and years, as names repeat in a family.
function named(view: TreeView, id: number) {
  const ref = view.ref(id);
  if (typeof ref === 'string') return ref;
  const years = [ref.born ?? '', ref.died ?? ''].join('–');
  return years === '–' ? ref.name : `${ref.name} (${years})`;
}

export const selectPerson = showOperation<{ personId: number }>({
  name: 'select_person',
  description:
    'Selects a person in the app, as the user would: the chart is built around them and their details open. Use it when the user asks to see someone, or the answer is about someone else than the person on screen and seeing them helps.',
  input: {
    type: 'object',
    properties: { personId: { type: 'integer' } },
    required: ['personId'],
    additionalProperties: false
  },
  shows(view, { personId }) {
    const why = unshowable(view, personId);
    if (why !== null) return { rejected: why };
    return {
      on: { kind: 'person', personId },
      label: `Selected ${named(view, personId)}`
    };
  }
});

export const openSource = showOperation<{
  personId: number;
  citationId: number;
}>({
  name: 'open_source',
  description:
    "Opens one of a person's sources (a Citation, by its id in `person`) in the app's Scan viewer, at its church-book page, selecting the person first. Use it when the user asks to see a page, or to show the page an answer rests on.",
  input: {
    type: 'object',
    properties: {
      personId: { type: 'integer' },
      citationId: { type: 'integer' }
    },
    required: ['personId', 'citationId'],
    additionalProperties: false
  },
  shows(view, { personId, citationId }) {
    const why = unshowable(view, personId);
    if (why !== null) return { rejected: why };
    const details = view.services.personDetails(personId);
    const c = details?.citations.find((x) => x.id === citationId);
    if (c === undefined) return { rejected: 'They have no such source.' };
    const source = c.reference ?? c.source ?? 'their source';
    return {
      on: {
        kind: 'citation',
        personId,
        citationId,
        source: c.source,
        reference: c.reference
      },
      label: `Opened ${named(view, personId)}: ${source}`
    };
  }
});
