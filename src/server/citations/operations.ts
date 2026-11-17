// The operations on a dataset's Citations (common/operations/citations),
// answered by its Citations.

import type { BoxAt } from '@/common/operations';
import type { CITATION_OPERATIONS } from '@/common/operations/citations';
import type {
  ImagePages,
  VisionPageTry,
  VisionSurvey,
  VolumeLocating
} from '@/common/types';

import { answered, notFound, Refusal } from '../operations';
import type { Handlers } from '../operations';
import { AstiaError } from './astia/astia';
import type { Citations } from './citations';

interface Doers {
  // Switches a Volume, `volume` by its label, to Astia's new filming: its
  // Images' viewer URLs.
  switchFilming: (volumeId: string, volume: string) => Promise<string[]>;
  // Looks for the citations' references on the Image `at` at once.
  findAllOnImage: (
    citationIds: number[],
    at: BoxAt,
    model: string
  ) => Promise<VisionPageTry | { rejected: string }>;
  // Surveys how the Volume numbers its pages (ADR-0032); `fresh`, reading
  // it all again.
  surveyPages: (
    volumeId: string,
    volume: string,
    model: string,
    fresh: boolean
  ) => Promise<VisionSurvey | { rejected: string }>;
  // Locates every estimate in the Volume, its page survey first where
  // none of its pages are known (ADR-0032).
  locateVolume: (
    volumeId: string,
    volume: string,
    model: string
  ) => AsyncIterable<VolumeLocating>;
  // The pages the Volume's Page pins put on each of its Images, or its
  // numbering without them; `volume` by its label.
  volumePages: (volumeId: string, volume: string) => Promise<ImagePages[]>;
  // Sets the Image's page by hand, or takes it away: why it can't be, or
  // nothing.
  setImagePage: (
    at: { volumeId: string; volume: string; image: number },
    pages: number[] | null
  ) => Promise<{ rejected: string } | null>;
  // Takes the Volume's Page pins away: why it can't be, or nothing.
  clearVolumePages: (volumeId: string) => Promise<{ rejected: string } | null>;
}

// A request to Astia failing is refused (502), in words the Scan viewer
// can show; anything else thrown is a bug, and is thrown on.
export async function askingAstia<T>(asked: Promise<T>) {
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
  {
    switchFilming,
    findAllOnImage,
    surveyPages,
    locateVolume,
    volumePages,
    setImagePage,
    clearVolumePages
  }: Doers
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

    entryOffers: async (asked) =>
      await askingAstia(citations.entries.offers(asked)),

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

    findAllOnImage: async ({ citationIds, at, model }) =>
      answered(
        await askingAstia(findAllOnImage(citationIds, at, model)),
        'citation'
      ),

    surveyPages: async ({ volumeId, volume, model, fresh }) =>
      answered(
        await askingAstia(surveyPages(volumeId, volume, model, fresh)),
        'volume'
      ),

    locateVolume: ({ volumeId, volume, model }) =>
      locateVolume(volumeId, volume, model),

    volumeChoices: async ({ citationId }) =>
      answered(
        await askingAstia(citations.volumeChoices(citationId)),
        'citation'
      ),

    volumeCitations: async ({ volumeId }) =>
      await askingAstia(citations.inVolume(volumeId)),

    volumePages: async ({ volumeId, volume }) =>
      await askingAstia(volumePages(volumeId, volume)),

    async setImagePage({ volumeId, volume, image, pages }) {
      const refused = await askingAstia(
        setImagePage({ volumeId, volume, image }, pages)
      );
      if (refused !== null) throw new Refusal(409, refused.rejected);
      return await askingAstia(volumePages(volumeId, volume));
    },

    async clearVolumePages({ volumeId, volume }) {
      const refused = await askingAstia(clearVolumePages(volumeId));
      if (refused !== null) throw new Refusal(409, refused.rejected);
      return await askingAstia(volumePages(volumeId, volume));
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
