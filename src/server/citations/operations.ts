// The operations on a dataset's Citations (common/operations/citations),
// answered by its Citations.

import type { BoxAt } from '@/common/operations';
import type { CITATION_OPERATIONS } from '@/common/operations/citations';
import type {
  VisionPageTry,
  VisionSurvey,
  VolumeLocating
} from '@/common/types';

import { answered, notFound, Refusal } from '../operations';
import type { Handlers } from '../operations';
import { AstiaError } from './astia/astia';
import type { Citations } from './citations';
import type { VolumeFacts } from './volume-facts';

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
  // The data folder's Volume facts: its Volumes' page numbers.
  pages: Pick<
    VolumeFacts,
    'pagesOn' | 'numbering' | 'setImagePage' | 'clearPages' | 'mark'
  >;
  // Whether an entry can be cited on the Image: not on one an offloaded
  // Volume doesn't keep.
  citable: (at: { volumeId: string; image: number }) => Promise<boolean>;
}

// Refused (409) on an Image an offloaded Volume doesn't keep.
async function onCitable(
  citable: Doers['citable'],
  at: { volumeId: string; image?: number }
) {
  if (at.image === undefined) return;
  if (!(await citable({ volumeId: at.volumeId, image: at.image }))) {
    throw new Refusal(
      409,
      'The volume is offloaded: only its cited images can be cited.'
    );
  }
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

// A refusal to change a Volume's page numbers is refused (409) in its
// words.
function refused(result: { rejected: string } | null) {
  if (result !== null) throw new Refusal(409, result.rejected);
}

export function citationOperations(
  citations: Citations,
  {
    switchFilming,
    findAllOnImage,
    surveyPages,
    locateVolume,
    pages,
    citable
  }: Doers
): Handlers<typeof CITATION_OPERATIONS> {
  // The Volume's pages, and what's known of its numbering.
  async function volumePagesOf(volumeId: string, volume: string) {
    const [images, numbering] = await Promise.all([
      askingAstia(pages.pagesOn(volumeId, volume)),
      pages.numbering(volumeId)
    ]);
    return { images, numbering };
  }

  return {
    // Astia is slow and throttled, so a person's citations share one
    // streamed request rather than holding a connection each.
    personLinks: ({ personId }) => citations.linksOf(personId),

    async mark({ citationId, at }) {
      await onCitable(citable, at);
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
      await onCitable(citable, at);
      const { text, ...where } = at;
      return answered(
        await askingAstia(citations.entries.make(where, text, people)),
        'person'
      );
    },

    entryOffers: async (asked) =>
      await askingAstia(citations.entries.offers(asked)),

    async editEntry({ entryId, edit }) {
      if (edit.at !== undefined) await onCitable(citable, edit.at);
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
      await volumePagesOf(volumeId, volume),

    async setImagePage({ volumeId, volume, image, pages: set }) {
      refused(
        await askingAstia(pages.setImagePage({ volumeId, volume, image }, set))
      );
      return await volumePagesOf(volumeId, volume);
    },

    async clearVolumePages({ volumeId, volume }) {
      refused(await askingAstia(pages.clearPages(volumeId)));
      return await volumePagesOf(volumeId, volume);
    },

    async markPages({ volumeId, as }) {
      await pages.mark(volumeId, as);
      return await pages.numbering(volumeId);
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
