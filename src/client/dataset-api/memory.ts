// Test support: a Dataset API answering from values the test gives, so app
// state runs without a server. It fails as the app does: unknown people,
// Volumes and Marks throw ApiError with the server's words.

import type {
  CitationLinks,
  FamilyRow,
  PersonDetails,
  PersonRow,
  VolumeCitation
} from '@common/types';

import { ApiError, NOT_RESPONDING } from '.';
import type { DatasetApi } from '.';

export interface MemoryVolume {
  images: number;
  citations: VolumeCitation[];
}

export interface MemoryDataset {
  persons?: PersonRow[];
  families?: FamilyRow[];
  // By person id.
  details?: Record<number, PersonDetails>;
  // Each person's references, by person id, in the order they resolve.
  links?: Record<number, CitationLinks[]>;
  // By Volume id.
  volumes?: Record<string, MemoryVolume>;
  // What saving a Mark answers, by citation id.
  marks?: Record<number, CitationLinks>;
}

export interface MemoryOptions {
  // Every call fails, as when the app can't be reached.
  down?: boolean;
}

export type MemoryDatasetApi = DatasetApi & {
  // What was asked, in order: "persons", "families", "person <id>",
  // "links <id>", "mark <citation> <volume>/<image>", "citations <volume>",
  // "images <volume>".
  asked: string[];
};

export function memoryDatasetApi(
  data: MemoryDataset,
  { down = false }: MemoryOptions = {}
): MemoryDatasetApi {
  const asked: string[] = [];

  async function answer<T>(
    what: string,
    signal: AbortSignal | undefined,
    give: () => T
  ) {
    asked.push(what);
    // Answered a turn later, as over HTTP; an abort meanwhile wins, as
    // `settled` makes it there.
    try {
      await Promise.resolve();
      if (down) throw new ApiError(NOT_RESPONDING);
      const value = give();
      signal?.throwIfAborted();
      return value;
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the abort's own reason
      if (signal?.aborted === true) throw signal.reason;
      throw err;
    }
  }

  function found<T>(value: T | undefined, missing: string) {
    if (value === undefined) throw new ApiError(missing);
    return value;
  }

  function volume(volumeId: string) {
    return found(
      data.volumes?.[volumeId],
      "volume not in the dataset's parishes"
    );
  }

  return {
    asked,

    persons: async (signal) =>
      await answer('persons', signal, () => data.persons ?? []),

    families: async (signal) =>
      await answer('families', signal, () => data.families ?? []),

    person: async (id, signal) =>
      await answer(`person ${id}`, signal, () =>
        found(data.details?.[id], 'person not found')
      ),

    async *personLinks(id, signal) {
      const lines = await answer(
        `links ${id}`,
        signal,
        () => data.links?.[id] ?? []
      );
      for (const line of lines) {
        signal?.throwIfAborted();
        // eslint-disable-next-line no-await-in-loop -- one line at a time, as streamed
        yield await Promise.resolve(line);
      }
    },

    mark: async (citationId, at) =>
      await answer(
        `mark ${citationId} ${at.volumeId}/${at.image}`,
        undefined,
        () => found(data.marks?.[citationId], 'citation not found')
      ),

    volumeCitations: async (volumeId, signal) =>
      await answer(
        `citations ${volumeId}`,
        signal,
        () => volume(volumeId).citations
      ),

    volumeImages: async (volumeId, signal) =>
      await answer(`images ${volumeId}`, signal, () =>
        Array.from(
          { length: volume(volumeId).images },
          (_, i) => `memory:viewer/${volumeId}/${i + 1}`
        )
      ),

    imageUrl: (volumeId, n, retry) =>
      `memory:image/${volumeId}/${n}${retry === 0 ? '' : `?retry=${retry}`}`,

    thumbUrl: (volumeId, n) => `memory:thumb/${volumeId}/${n}`,

    mediaUrl: (storedPath) => `memory:media/${storedPath}`
  };
}
