import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { Rescan } from '@/common/types';

import { Latest } from './latest';
import type { Readable } from './selected';

// Whether Astia re-scanned the Volume shown, asked once per Volume while
// it's shown: `rescan` is the question put to the person, `oldFilming`
// that the Volume is known to be re-scanned and not switched to.
export function filmingOf(api: DatasetApi, shownId: () => string | undefined) {
  const rescan = signal<Rescan | null>(null);
  // Astia's re-scan of the Volume shown, kept after Not now.
  const known = signal<Rescan | null>(null);
  const oldFilming = computed(() => known.get() !== null);
  // The Volume shown, once Astia answered whether it was re-scanned.
  const answered = new Set<string>();
  const req = new Latest();

  async function ask(volumeId: string) {
    if (answered.has(volumeId)) return;
    const answer = await req.run(async (signal) => ({
      found: await api.volumeRescan(volumeId, signal)
    }));
    if (answer === null || answer === undefined) return;
    if (shownId() !== volumeId) return;
    answered.add(volumeId);
    rescan.set(answer.found);
    known.set(answer.found);
  }

  // Nothing known, as before any Volume was shown.
  function forget() {
    req.stop();
    answered.clear();
    switched();
  }

  // The Volume shown is on Astia's new filming.
  function switched() {
    rescan.set(null);
    known.set(null);
  }

  // Asked again, as after Not now.
  function askAgain() {
    rescan.set(known.get());
  }

  // Not asked again until the Volume is next shown.
  function keep() {
    rescan.set(null);
  }

  return {
    rescan: rescan as Readable<Rescan | null>,
    oldFilming: oldFilming as Readable<boolean>,
    ask,
    forget,
    switched,
    askAgain,
    keep
  };
}
