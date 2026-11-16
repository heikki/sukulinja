import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { ImagePages } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// The pages the shown Volume's Page pins put on its Images (ADR-0032),
// for the Scan viewer to tell those of the Image shown: loaded with the
// Volume's citations, as a Mark, a Match or a page survey changes both.
export function volumePagesOf(
  api: Pick<DatasetApi, 'volumePages'>,
  image: Readable<number>
) {
  const pages = signal<ImagePages[]>([]);
  const req = new Latest();
  const here = computed(
    () => pages.get().find((p) => p.image === image.get()) ?? null
  );

  return {
    here: here as Readable<ImagePages | null>,
    async load(volumeId: string) {
      const got = await req.run(
        async (signal) => await api.volumePages(volumeId, signal)
      );
      if (got !== undefined) pages.set(got ?? []);
    },
    clear() {
      req.stop();
      pages.set([]);
    }
  };
}
