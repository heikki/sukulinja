import type { DatasetApi } from '@/client/dataset-api';
import type { NewRelative, PersonName } from '@/common/types';

import type { Chart } from './chart';
import type { Selected } from './selected';

// Changing the tree's people: putting someone in place as a person's
// relative, a new person or one already in the tree, and changing a
// person's name and sex. Each throws ApiError if it's refused.
export interface PersonEdits {
  // Once in place, the chart has the relative, selected.
  addRelative: (personId: number, relative: NewRelative) => Promise<void>;
  // Once changed, the chart and the panel read the person again.
  edit: (personId: number, name: PersonName) => Promise<void>;
}

export function openPersonEdits(
  api: DatasetApi,
  chart: Chart,
  selected: Selected
): PersonEdits {
  return {
    async addRelative(personId, relative) {
      const id = await api.addRelative(personId, relative);
      await chart.added(id);
    },
    async edit(personId, name) {
      await api.editPerson(personId, name);
      await Promise.all([chart.reloadPeople(), selected.refresh()]);
    }
  };
}
