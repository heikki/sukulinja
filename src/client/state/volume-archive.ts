import { signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';

import { Latest } from './latest';
import type { Readable } from './selected';

// The title of the archive the Scan viewer's Volume is in, as Astia names
// it. Until Astia says, the one named before stays, as the next Volume is
// most likely in the same archive: the title doesn't blink each time the
// Volume changes. A Volume shown before is named at once.
export function openVolumeArchive(api: DatasetApi) {
  const title = signal<string | null>(null);
  const req = new Latest();
  const known = new Map<string, string>();

  return {
    title: title as Readable<string | null>,

    async show(volumeId: string) {
      const kept = known.get(volumeId);
      if (kept !== undefined) {
        req.stop();
        title.set(kept);
        return;
      }
      const named = await req.run(
        async (signal) => await api.volumeArchive(volumeId, signal)
      );
      if (named === undefined) return;
      if (named !== null) known.set(volumeId, named);
      title.set(named);
    },

    // With no Volume shown, none.
    forget() {
      req.stop();
      title.set(null);
    }
  };
}
