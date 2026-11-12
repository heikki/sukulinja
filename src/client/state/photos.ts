import { signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { DatasetApi } from '@/client/dataset-api';
import type { PhotoRow } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// How adding pictures from disk goes: how many of how many are in so far.
export interface Adding {
  done: number;
  of: number;
}

// Every Photo of the dataset, as the Photos view lists them: asked for
// once something shows them, and asked for again once a Tag is saved or
// taken back, as that changes who's on them, or a Photo is added or
// deleted.
export interface Photos {
  // Those no one is linked to or tagged in first, then the rest as the
  // import listed them; null until they arrive.
  all: Readable<PhotoRow[] | null | 'failed'>;
  // Asks for them, unless they've come or are coming.
  load: () => void;
  // Asks for them again, if they were asked for.
  refresh: () => void;
  // Adds the pictures, one after another: the first new Photo, else the
  // first the dataset had already, null when none was added.
  add: (files: File[]) => Promise<PhotoRow | null>;
  // While pictures are being added.
  adding: Readable<Adding | null>;
  // Why the last pictures added weren't, each in the server's words.
  refused: Readable<string[]>;
  // Forgets why.
  dismiss: () => void;
}

export function openPhotos(api: DatasetApi): Photos {
  const all = signal<PhotoRow[] | null | 'failed'>(null);
  const adding = signal<Adding | null>(null);
  const refused = signal<string[]>([]);
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

  function refresh() {
    if (asked || Array.isArray(all.get())) void load();
  }

  async function add(files: File[]) {
    if (files.length === 0 || adding.get() !== null) return null;
    const why: string[] = [];
    let added: PhotoRow | null = null;
    let had: PhotoRow | null = null;
    refused.set([]);
    adding.set({ done: 0, of: files.length });
    try {
      for (const [i, file] of files.entries()) {
        try {
          // eslint-disable-next-line no-await-in-loop -- one at a time, to say how far it's got
          const { photo, already } = await api.addPhoto(file);
          if (already) had ??= photo;
          else added ??= photo;
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          why.push(err.message);
        }
        adding.set({ done: i + 1, of: files.length });
      }
    } finally {
      adding.set(null);
      refused.set(why);
      refresh();
    }
    return added ?? had;
  }

  return {
    all,
    load() {
      if (!asked) void load();
    },
    refresh,
    add,
    adding,
    refused,
    dismiss() {
      refused.set([]);
    }
  };
}
