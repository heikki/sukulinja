import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { ImagePages } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// The pages the shown Volume's Page pins put on its Images (ADR-0032),
// for the Scan viewer to tell those of the Image shown: loaded with the
// Volume's citations, as a Mark, a Match or a page survey changes both.
// One set here by hand moves the estimates counted from it, so `reload`
// loads them anew.
export function volumePagesOf(
  api: Pick<DatasetApi, 'volumePages' | 'setImagePage'>,
  shown: {
    volume: Readable<{ id: string; label: string } | null>;
    image: Readable<number>;
  },
  reload: (volumeId: string) => Promise<void>
) {
  const { image } = shown;
  const pages = signal<ImagePages[]>([]);
  const req = new Latest();
  const here = computed(
    () => pages.get().find((p) => p.image === image.get()) ?? null
  );

  const byHand = computed(
    () => pages.get().filter((p) => p.by === 'hand').length
  );

  return {
    here: here as Readable<ImagePages | null>,
    byHand: byHand as Readable<number>,
    async load(volumeId: string) {
      const volume = shown.volume.get()?.label ?? '';
      const got = await req.run(
        async (signal) => await api.volumePages({ volumeId, volume }, signal)
      );
      if (got !== undefined) pages.set(got ?? []);
    },
    // Sets the pages of the Image shown by hand, a spread's two or one, or
    // with null takes them away; throws ApiError if it's refused.
    setHere: async (set: number[] | null) => {
      const v = shown.volume.get();
      if (v === null) return;
      const at = { volumeId: v.id, volume: v.label, image: image.get() };
      req.stop();
      pages.set(await api.setImagePage(at, set));
      await reload(v.id);
    },
    clear() {
      req.stop();
      pages.set([]);
    }
  };
}
