// The operations on a dataset's Citations (common/operations/citations),
// answered by its Citations.

import type { CITATION_OPERATIONS } from '@/common/operations/citations';

import { answered, notFound, Refusal } from '../operations';
import type { Handlers } from '../operations';
import { AstiaError } from './astia/astia';
import type { Citations } from './citations';

// Switches a Volume, `volume` by its label, to Astia's new filming: its
// Images' viewer URLs.
type SwitchFilming = (volumeId: string, volume: string) => Promise<string[]>;

// A request to Astia failing is refused (502), in words the Scan viewer
// can show; anything else thrown is a bug, and is thrown on.
async function askingAstia<T>(asked: Promise<T>) {
  try {
    return await asked;
  } catch (err) {
    if (err instanceof AstiaError) {
      throw new Refusal(502, "Astia couldn't be reached or gave no answer.");
    }
    throw err;
  }
}

export function citationOperations(
  citations: Citations,
  switchFilming: SwitchFilming
): Handlers<typeof CITATION_OPERATIONS> {
  return {
    // Astia is slow and throttled, so a person's citations share one
    // streamed request rather than holding a connection each.
    personLinks: ({ personId }) => citations.linksOf(personId),

    async mark({ citationId, at }) {
      const { resolution } = answered(
        await askingAstia(citations.mark(citationId, at)),
        'citation'
      );
      return { citationId, ...resolution };
    },

    async discard({ citationId, at }) {
      const { resolution } = answered(
        await askingAstia(citations.discard(citationId, at)),
        'citation'
      );
      return { citationId, ...resolution };
    },

    async citeEntry({ at, people }) {
      const { text, ...where } = at;
      return answered(
        await askingAstia(citations.entries.make(where, text, people)),
        'person'
      );
    },

    async editEntry({ entryId, edit }) {
      return answered(
        await askingAstia(citations.entries.edit(entryId, edit)),
        'entry or person'
      );
    },

    async retext({ citationId, text }) {
      answered(
        await askingAstia(citations.retext(citationId, text)),
        'citation'
      );
    },

    deleteEntry({ entryId }) {
      if (citations.entries.remove(entryId) === null) throw notFound('entry');
    },

    uncite({ citationId }) {
      if (citations.uncite(citationId) === null) throw notFound('citation');
    },

    support: ({ citationId, factId, on }) =>
      answered(citations.support(citationId, factId, on), 'citation or fact'),

    volumeChoices: async ({ citationId }) =>
      answered(
        await askingAstia(citations.volumeChoices(citationId)),
        'citation'
      ),

    async volumeCitations({ volumeId }) {
      const rows = await askingAstia(citations.inVolume(volumeId));
      if (rows === null) {
        throw new Refusal(404, "volume not in the dataset's parishes");
      }
      return rows;
    },

    archives: async () => await askingAstia(citations.churchBookArchives()),

    archiveCitations: async ({ archiveId }) =>
      await askingAstia(citations.countInArchive(archiveId)),

    volume: async ({ volumeId }) =>
      await askingAstia(citations.contentsOf(volumeId)),

    switchFilming: async ({ volumeId, volume }) =>
      await askingAstia(switchFilming(volumeId, volume))
  };
}
