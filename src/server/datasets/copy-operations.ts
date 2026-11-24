// The operations making a new dataset from this one
// (common/operations/datasets): its people copied by the registry, the
// Change in the new dataset saying where they came from.

import type { DATASET_OPERATIONS } from '@/common/operations/datasets';
import { slugFromFilename } from '@/common/slug';

import type { NewChange } from '../changes/changes';
import { Refusal } from '../operations';
import type { Handlers } from '../operations';
import { copyRefused } from './copy';
import type { DatasetRegistry } from './registry';

interface CopyFrom {
  registry: DatasetRegistry;
  // The dataset's slug, and its people and families as they are now.
  slug: string;
  tree: Parameters<typeof copyRefused>[0];
  // Writes a Change into the dataset under the slug.
  changed: (slug: string, change: NewChange) => void;
}

export function copyOperations({
  registry,
  slug,
  tree,
  changed
}: CopyFrom): Handlers<typeof DATASET_OPERATIONS> {
  return {
    async copyToNewDataset({ name, personIds }) {
      const displayName = name.trim();
      const to = slugFromFilename(displayName);
      if (to === '') {
        throw new Refusal(400, 'The name needs a letter or a digit.');
      }
      if (registry.has(to)) {
        const taken = registry.info(to)?.displayName ?? displayName;
        throw new Refusal(409, `There's a dataset named ${taken} already.`);
      }
      const refused = copyRefused(tree, personIds);
      if (refused !== null) throw new Refusal(400, refused);
      const info = await registry.copy({
        from: slug,
        personIds,
        slug: to,
        displayName
      });
      changed(to, {
        on: null,
        what: {
          kind: 'new-dataset',
          copied: {
            from: registry.info(slug)?.displayName ?? slug,
            people: info.personCount
          }
        }
      });
      return info;
    }
  };
}
