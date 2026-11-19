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
// Whether a Volume's page numbers are marked checked, and marking them,
// the install's for every dataset; throws ApiError if it's refused.
export interface PagesChecked {
  checked: (volumeId: string, signal: AbortSignal) => Promise<boolean>;
  check: (volumeId: string, on: boolean) => Promise<void>;
}

// None marked, and marking kept nowhere.
export const NO_CHECKS: PagesChecked = {
  checked: async () => await Promise.resolve(false),
  async check() {
    await Promise.resolve();
  }
};

export function volumePagesOf(
  api: Pick<DatasetApi, 'volumePages' | 'setImagePage' | 'clearVolumePages'>,
  shown: {
    volume: Readable<{ id: string; label: string } | null>;
    image: Readable<number>;
  },
  reload: (volumeId: string) => Promise<void>,
  checks: PagesChecked = NO_CHECKS
) {
  const { image } = shown;
  const pages = signal<ImagePages[]>([]);
  const checked = signal(false);
  const req = new Latest();
  const checkedReq = new Latest();
  const here = computed(
    () => pages.get().find((p) => p.image === image.get()) ?? null
  );

  const byHand = computed(
    () => pages.get().filter((p) => p.by === 'hand').length
  );

  const pinned = computed(
    () => pages.get().filter((p) => p.by !== null).length
  );
  const numbered = computed(() => pinned.get() > 0);

  return {
    // Those on the Image shown, read there or counted from the pins around
    // it, or as its book is numbered without any; null until known.
    here: here as Readable<ImagePages | null>,
    // Whether any Image has its pages read or set, so locating the
    // Volume's estimates needs no survey first.
    numbered: numbered as Readable<boolean>,
    // How many Images have their pages read or set.
    pinned: pinned as Readable<number>,
    // How many Images have pages set by hand, which a page survey takes
    // away.
    byHand: byHand as Readable<number>,
    // Whether the Volume's page numbers are marked checked: then they're
    // locked, and nothing here changes them.
    checked: checked as Readable<boolean>,
    async load(volumeId: string) {
      const volume = shown.volume.get()?.label ?? '';
      const [got, isChecked] = await Promise.all([
        req.run(
          async (signal) => await api.volumePages({ volumeId, volume }, signal)
        ),
        checkedReq.run(async (signal) => await checks.checked(volumeId, signal))
      ]);
      if (got !== undefined) pages.set(got ?? []);
      if (isChecked !== undefined) checked.set(isChecked ?? false);
    },
    // Marks the shown Volume's page numbers checked, or no longer.
    setChecked: async (on: boolean) => {
      const v = shown.volume.get();
      if (v === null) return;
      checkedReq.stop();
      await checks.check(v.id, on);
      checked.set(on);
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
    // Takes every page read or set in the Volume away, its pages then
    // counted as its book is numbered; throws ApiError if it's refused.
    clearVolume: async () => {
      const v = shown.volume.get();
      if (v === null) return;
      req.stop();
      pages.set(
        await api.clearVolumePages({ volumeId: v.id, volume: v.label })
      );
      await reload(v.id);
    },
    clear() {
      req.stop();
      checkedReq.stop();
      pages.set([]);
      checked.set(false);
    }
  };
}

export type VolumePages = ReturnType<typeof volumePagesOf>;
