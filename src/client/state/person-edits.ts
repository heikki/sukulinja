import type { DatasetApi } from '@/client/dataset-api';
import type { NewRelative, PersonName } from '@/common/types';

import type { Chart, People } from './chart';
import type { Selected } from './selected';

// Changing the tree's people: putting someone in place as a person's
// relative, a new person or one already in the tree, changing a person's
// name and sex, taking them out of a family, and deleting them. Each throws ApiError if it's refused.
export interface PersonEdits {
  // Once in place, the chart has the relative: their id, for whoever
  // asked to select them, or cite or tag them.
  addRelative: (personId: number, relative: NewRelative) => Promise<number>;
  // Once changed, the chart and the panel read the person again.
  edit: (personId: number, name: PersonName) => Promise<void>;
  // Once taken out of the family, the chart and the panel read the tree
  // again.
  unlink: (personId: number, familyId: number) => Promise<void>;
  // Once deleted, the chart moves to their nearest relative if it was on
  // them.
  remove: (personId: number) => Promise<void>;
}

// Whom the chart moves to when the person goes: a parent, else a spouse,
// else a child, else anyone left.
export function nearestRelative(personId: number, people: People) {
  const parents = people.parentFamByPerson.get(personId);
  const spouseFams = people.spouseFamsByPerson.get(personId) ?? [];
  const candidates = [
    parents?.husband_id,
    parents?.wife_id,
    ...spouseFams.map((f) =>
      f.husband_id === personId ? f.wife_id : f.husband_id
    ),
    ...spouseFams.flatMap((f) => f.child_ids),
    ...people.persons.keys()
  ];
  return (
    candidates.find(
      (id): id is number => id !== null && id !== undefined && id !== personId
    ) ?? null
  );
}

export function openPersonEdits(
  api: DatasetApi,
  chart: Chart,
  selected: Selected
): PersonEdits {
  return {
    async addRelative(personId, relative) {
      const id = await api.addRelative(personId, relative);
      await chart.relinked();
      return id;
    },
    async edit(personId, name) {
      await api.editPerson(personId, name);
      await Promise.all([chart.reloadPeople(), selected.refresh()]);
    },
    async unlink(personId, familyId) {
      await api.unlink(personId, familyId);
      await Promise.all([chart.relinked(), selected.refresh()]);
    },
    async remove(personId) {
      const next = nearestRelative(personId, chart.people.get());
      await api.deletePerson(personId);
      if (next !== null) await chart.removed(personId, next);
    }
  };
}
