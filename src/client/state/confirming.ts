import { signal } from '@lit-labs/signals';

import { ApiError } from '@/client/dataset-api';
import type { VolumeCitation } from '@/common/types';

import type { Readable } from './selected';
import type { LinkOpen } from './viewer';

// Confirming the source's Match: saving, or refused in the server's words.
export type Confirming = 'saving' | { refused: string };

// Confirms the source's Match with `confirm`, as its Box's menu asks, and
// says how that's going. A refusal is kept only while the source is the
// one it was about, and until `forget`.
export function confirmingSource(
  source: Readable<LinkOpen | null>,
  confirm: (row: Pick<VolumeCitation, 'citation' | 'link'>) => Promise<void>
) {
  const status = signal<Confirming | null>(null);

  async function run() {
    const shown = source.get();
    const link = shown?.link;
    if (shown === null || link?.certainty !== 'match') return;
    if (status.get() === 'saving') return;
    status.set('saving');
    try {
      await confirm({ citation: shown.citation, link });
      status.set(null);
    } catch (err) {
      status.set(null);
      if (!(err instanceof ApiError)) throw err;
      if (source.get() === shown) status.set({ refused: err.message });
    }
  }

  function forget() {
    if (status.get() !== 'saving') status.set(null);
  }

  return { status: status as Readable<Confirming | null>, run, forget };
}
