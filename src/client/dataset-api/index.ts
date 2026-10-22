// What a dataset's screens ask the app: one method per question, answered
// typed. `openDatasetApi` asks over HTTP, and is where every route string
// lives; `memoryDatasetApi` (memory.ts) answers from values a test gives.

import { readNdjson } from '@client/ndjson';
import type {
  Box,
  CitationLinks,
  FamilyRow,
  PersonDetails,
  PersonRow,
  Rescan,
  VolumeChoices,
  VolumeCitation
} from '@common/types';

// A request the app answered with an error, or couldn't be reached for. Its
// words are for the person using the app. Anything else thrown is a bug.
export class ApiError extends Error {
  override name = 'ApiError';
}

export const NOT_RESPONDING = 'The app is not responding.';

// Where a Mark puts a reference: an Image of a Volume, or only the Volume.
// On an Image, `box` is the entry drawn, null for none; left out, a Vision
// match's Box there is kept.
export interface MarkTarget {
  volumeId: string;
  image?: number;
  box?: Box | null;
}

// Where a Box is: on an Image of a Volume.
export interface BoxAt {
  volumeId: string;
  image: number;
}

// An entry cited in the app: its Box on an Image of a Volume, by the
// Image's file id, with what it is, if said.
export interface CiteTarget {
  volumeId: string;
  image: number;
  fileId: string;
  box: Box;
  text: string | null;
}

// Each call rejects with ApiError when it fails, and with the signal's
// reason once `signal` aborts.
export interface DatasetApi {
  persons: (signal?: AbortSignal) => Promise<PersonRow[]>;
  families: (signal?: AbortSignal) => Promise<FamilyRow[]>;
  person: (id: number, signal?: AbortSignal) => Promise<PersonDetails>;
  // A person's church-book references as each one's Links resolve.
  personLinks: (
    id: number,
    signal?: AbortSignal
  ) => AsyncGenerator<CitationLinks, void, undefined>;
  // Saves a Mark: the reference's Links, resolved again.
  mark: (citationId: number, at: MarkTarget) => Promise<CitationLinks>;
  // Takes back the reference's Box at `at`, a Mark's or a Vision match's:
  // its Links, resolved again.
  discard: (citationId: number, at: BoxAt) => Promise<CitationLinks>;
  // Makes a Citation of the entry for the person: it as the Volume's
  // citations list it.
  cite: (personId: number, at: CiteTarget) => Promise<VolumeCitation>;
  // Deletes a Citation made in the app.
  uncite: (citationId: number) => Promise<void>;
  // The Volumes a reference can be put in.
  volumeChoices: (
    citationId: number,
    signal?: AbortSignal
  ) => Promise<VolumeChoices>;
  // The dataset's people citing a Volume, wherever its Links put them.
  volumeCitations: (
    volumeId: string,
    signal?: AbortSignal
  ) => Promise<VolumeCitation[]>;
  // Astia's viewer URL for each Image of a Volume, in order.
  volumeImages: (volumeId: string, signal?: AbortSignal) => Promise<string[]>;
  // Astia's re-scan of the Volume not yet switched to, and what switching
  // leaves out; null when there's none.
  volumeRescan: (
    volumeId: string,
    signal?: AbortSignal
  ) => Promise<Rescan | null>;
  // Switches the Volume to Astia's new filming: its Images' viewer URLs.
  switchFilming: (volumeId: string) => Promise<string[]>;
  // An Image as the app serves and caches it; `retry` makes a failed load
  // ask again.
  imageUrl: (volumeId: string, n: number, retry: number) => string;
  // Astia's 250px thumbnail of an Image.
  thumbUrl: (volumeId: string, n: number) => string;
  // A photo imported with the dataset.
  mediaUrl: (storedPath: string) => string;
}

export interface FetchOptions {
  // How a request is sent; the global fetch by default.
  fetch?: (req: Request) => Promise<Response>;
  // Prefixed to every URL; none in the app, whose pages share its origin.
  origin?: string;
}

// After `signal` aborts, a call rejects with the signal's reason, whatever
// it failed with and even if its answer came, so a caller can tell
// superseded from failed. Checked here as well as by `fetch`, since a
// `fetch` given in tests may not watch the signal.
async function settled<T>(signal: AbortSignal | undefined, run: () => T) {
  try {
    const value = await run();
    signal?.throwIfAborted();
    return value;
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- the abort's own reason
    if (signal?.aborted === true) throw signal.reason;
    throw err;
  }
}

// The dataset `slug`, over HTTP.
export function openDatasetApi(
  slug: string,
  {
    fetch: send = async (req) => await fetch(req),
    origin = ''
  }: FetchOptions = {}
): DatasetApi {
  const dataset = `${origin}/d/${slug}`;
  const astia = `${origin}/astia/volumes`;

  // The answer, if it's not an error. `what` names the request when the app
  // gives no words of its own.
  async function ask(what: string, url: string, init: RequestInit = {}) {
    const req = new Request(url, init);
    const res = await send(req).catch((err: unknown) => {
      throw new ApiError(NOT_RESPONDING, { cause: err });
    });
    if (res.ok) return res;
    const words = await res.text().catch(() => '');
    throw new ApiError(words === '' ? `${what} failed (${res.status})` : words);
  }

  async function json<T>(what: string, url: string, signal?: AbortSignal) {
    return await settled(signal, async () => {
      const res = await ask(what, url, { signal });
      return (await res.json()) as T;
    });
  }

  return {
    persons: async (signal) =>
      await json<PersonRow[]>('persons', `${dataset}/api/persons`, signal),

    families: async (signal) =>
      await json<FamilyRow[]>('families', `${dataset}/api/families`, signal),

    person: async (id, signal) =>
      await json<PersonDetails>(
        'person',
        `${dataset}/api/persons/${id}`,
        signal
      ),

    async *personLinks(id, signal) {
      const url = `${dataset}/api/persons/${id}/scans`;
      const res = await settled(
        signal,
        async () => await ask('Links', url, { signal })
      );
      if (res.body === null) throw new ApiError('Links failed (no answer)');
      try {
        for await (const line of readNdjson(res.body)) {
          signal?.throwIfAborted();
          yield line as CitationLinks;
        }
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the abort's own reason
        if (signal?.aborted === true) throw signal.reason;
        // A line that isn't JSON is a bug; a stream cut off isn't.
        if (err instanceof SyntaxError) throw err;
        throw new ApiError(NOT_RESPONDING, { cause: err });
      }
    },

    async mark(citationId, at) {
      const res = await ask(
        'Mark',
        `${dataset}/api/citations/${citationId}/scans`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(at)
        }
      );
      return (await res.json()) as CitationLinks;
    },

    async discard(citationId, at) {
      const res = await ask(
        'Discard',
        `${dataset}/api/citations/${citationId}/scans`,
        {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(at)
        }
      );
      return (await res.json()) as CitationLinks;
    },

    async cite(personId, at) {
      const res = await ask(
        'Citing',
        `${dataset}/api/persons/${personId}/citations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(at)
        }
      );
      return (await res.json()) as VolumeCitation;
    },

    async uncite(citationId) {
      await ask('Deleting', `${dataset}/api/citations/${citationId}`, {
        method: 'DELETE'
      });
    },

    volumeChoices: async (citationId, signal) =>
      await json<VolumeChoices>(
        'the Volumes',
        `${dataset}/api/citations/${citationId}/volumes`,
        signal
      ),

    volumeCitations: async (volumeId, signal) =>
      await json<VolumeCitation[]>(
        "the Volume's citations",
        `${dataset}/api/volumes/${volumeId}/citations`,
        signal
      ),

    volumeImages: async (volumeId, signal) =>
      await json<string[]>(
        "the Volume's Images",
        `${astia}/${volumeId}/images`,
        signal
      ),

    volumeRescan: async (volumeId, signal) =>
      (
        await json<{ rescan: Rescan | null }>(
          "the Volume's re-scan",
          `${astia}/${volumeId}/rescan`,
          signal
        )
      ).rescan,

    async switchFilming(volumeId) {
      const url = `${astia}/${volumeId}/rescan`;
      const res = await ask('Switching', url, { method: 'POST' });
      return (await res.json()) as string[];
    },

    imageUrl(volumeId, n, retry) {
      const url = `${astia}/${volumeId}/images/${n}`;
      return retry === 0 ? url : `${url}?retry=${retry}`;
    },

    thumbUrl: (volumeId, n) => `${astia}/${volumeId}/images/${n}?size=thumb`,

    mediaUrl: (storedPath) => `${dataset}/media/${storedPath}`
  };
}
