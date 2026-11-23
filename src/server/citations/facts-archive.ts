// A Volume's facts, its page numbers and their marks, kept in the offload
// folder beside its Images too, so the folder holds each Volume whole:
// written there as they change, and at a sync each Volume's later copy
// kept whole, the folder's taken in place of the local file's when it's
// later (another computer's, say). Never merged.

import type { OffloadFolderStore } from './astia/offload-folder';
import { isLater, sameFacts } from './myheritage';
import type { Pins } from './myheritage';

interface Facts {
  volumeFacts: () => Promise<Pins>;
  adoptVolumeFacts: (volumes: Pins['volumes']) => Promise<void>;
}

function parsed(text: string | null): Pins['volumes'][string] | undefined {
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as Pins['volumes'][string];
  } catch {
    // One cut off or edited by hand is written over.
    return undefined;
  }
}

export function factsArchive(folder: OffloadFolderStore, facts: Facts) {
  // Each Volume's facts into the folder, unless it has them, or later.
  async function keep(local: Pins) {
    await Promise.all(
      Object.entries(local.volumes).map(async ([id, volume]) => {
        const archived = parsed(await folder.facts(id));
        if (archived !== undefined && isLater(archived, volume)) return;
        if (sameFacts(volume, archived) && archived?.saved === volume.saved) {
          return;
        }
        await folder.keepFacts(id, JSON.stringify(volume, null, 2));
      })
    );
  }

  // One keep after another, so a later save's copy is never written over
  // by an earlier one's.
  let last: Promise<void> = Promise.resolve();
  function queued(local: Pins) {
    last = last
      .catch(() => undefined)
      .then(async () => {
        await keep(local);
      });
    return last;
  }

  return {
    keep: queued,

    // The folder's later copies taken in, then every Volume's written out.
    async sync() {
      const local = await facts.volumeFacts();
      const later: Pins['volumes'] = {};
      for (const id of await folder.volumes()) {
        // eslint-disable-next-line no-await-in-loop -- one small file at a time
        const archived = parsed(await folder.facts(id));
        if (archived !== undefined && isLater(archived, local.volumes[id])) {
          later[id] = archived;
        }
      }
      await facts.adoptVolumeFacts(later);
      await queued(await facts.volumeFacts());
    }
  };
}
