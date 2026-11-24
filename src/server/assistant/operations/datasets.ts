// Proposing a new dataset copied from this one: everyone on the chart, or
// the people the assistant names.

import { slugFromFilename } from '@/common/slug';

import { copyRefused } from '../../datasets/copy';
import type { TreeView } from '../tree-view';
import { writeOperation } from './operation';

interface Copy {
  name: string;
  everyoneOnChart: boolean;
  personIds: number[];
}

// Whom to copy: everyone on the chart, or those named, none of them left
// out; or why not.
function whom(
  view: TreeView,
  everyoneOnChart: boolean,
  personIds: number[]
): number[] | { rejected: string } {
  if (everyoneOnChart) {
    const ids = [...new Set(view.onScreen.onChart ?? [])];
    return ids.length === 0 ? { rejected: 'No one is on the chart.' } : ids;
  }
  const why = personIds
    .map((id) => view.unwritable(id))
    .find((w) => w !== null);
  return why === undefined ? [...new Set(personIds)] : { rejected: why };
}

export const copyToNewDataset = writeOperation<Copy>({
  name: 'copy_to_new_dataset',
  description:
    'Proposes a new dataset, under `name`, copied from people of this one with all they hold (Facts, sources, Entries, photos; not Reminders or Changes); this dataset stays as it is. `everyoneOnChart` true copies everyone the chart draws, those left out included, and `personIds` is then empty; false copies `personIds`. They must be one tree through the families among them. Use it when the user asks for a tree or dataset of its own from a part of this one.',
  input: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      everyoneOnChart: { type: 'boolean' },
      personIds: { type: 'array', items: { type: 'integer' } }
    },
    required: ['name', 'everyoneOnChart', 'personIds'],
    additionalProperties: false
  },
  asks(view, { name, everyoneOnChart, personIds }) {
    const displayName = name.trim();
    if (slugFromFilename(displayName) === '') {
      return { rejected: 'The name needs a letter or a digit.' };
    }
    const ids = whom(view, everyoneOnChart, personIds);
    if (!Array.isArray(ids)) return ids;
    const refused = copyRefused(view.services.tree, ids);
    if (refused !== null) return { rejected: refused };
    const who = everyoneOnChart
      ? `everyone on the chart (${ids.length})`
      : `${ids.length} ${ids.length === 1 ? 'person' : 'people'}`;
    return {
      operation: 'copyToNewDataset',
      body: { name: displayName, personIds: ids },
      label: `New dataset ${displayName}: copy ${who}`,
      opens: { slug: slugFromFilename(displayName), name: displayName }
    };
  }
});
