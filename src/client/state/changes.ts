import { signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { Change } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// The dataset's Changes. The app writes them as things are done, so they're
// asked for anew each time something shows them.
export interface Changes {
  // Every Change, newest first; null until they arrive.
  all: Readable<Change[] | null | 'failed'>;
  // Asks for them again, keeping the last ones until they come.
  load: () => void;
  // Forgets every Change; throws an ApiError when the app can't.
  clear: () => Promise<void>;
}

export function openChanges(api: DatasetApi): Changes {
  const all = signal<Change[] | null | 'failed'>(null);
  const req = new Latest();

  async function load() {
    const rows = await req.run(async (s) => await api.changes(s));
    if (rows === undefined) return;
    all.set(rows ?? 'failed');
  }

  return {
    all,
    load() {
      void load();
    },
    async clear() {
      await api.clearChanges();
      req.stop();
      all.set([]);
    }
  };
}
