import { signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { PhotoRow } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// Every Photo of the dataset, as the Photos view lists them: asked for
// once something shows them, and asked for again once a Tag is saved or
// taken back, as that changes who's on them.
export interface Photos {
  // Those no one is linked to or tagged in first, then the rest as the
  // import listed them; null until they arrive.
  all: Readable<PhotoRow[] | null | 'failed'>;
  // Asks for them, unless they've come or are coming.
  load: () => void;
  // Asks for them again, if they were asked for.
  refresh: () => void;
}

export function openPhotos(api: DatasetApi): Photos {
  const all = signal<PhotoRow[] | null | 'failed'>(null);
  const req = new Latest();
  let asked = false;

  async function load() {
    asked = true;
    const rows = await req.run(async (s) => await api.photos(s));
    if (rows === undefined) return;
    if (rows === null) asked = false;
    // A refresh that fails keeps what was shown.
    if (rows !== null || !Array.isArray(all.get())) all.set(rows ?? 'failed');
  }

  return {
    all,
    load() {
      if (!asked) void load();
    },
    refresh() {
      if (asked || Array.isArray(all.get())) void load();
    }
  };
}
