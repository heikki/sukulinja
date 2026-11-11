import type { DatasetApi } from '@/client/dataset-api';
import type { NewRelative } from '@/common/types';

import type { Chart } from './chart';

// Adding people to the tree, each as someone's relative. Throws ApiError
// if it's refused; once added, the chart has them, selected.
export interface Relatives {
  add: (personId: number, relative: NewRelative) => Promise<void>;
}

export function openRelatives(api: DatasetApi, chart: Chart): Relatives {
  return {
    async add(personId, relative) {
      const id = await api.addRelative(personId, relative);
      await chart.added(id);
    }
  };
}
