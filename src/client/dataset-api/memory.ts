// Test support: a Dataset API answering from values the test gives, so app
// state runs without a server. It fails as the app does: unknown people,
// Volumes and Marks throw ApiError with the server's words.

import type {
  CitationLinks,
  FamilyRow,
  Link,
  PersonDetails,
  PersonRow,
  Reminder,
  ReminderOn,
  ReminderTarget,
  Rescan,
  StalePin,
  VolumeChoices,
  VolumeCitation
} from '@/common/types';

import { ApiError, NOT_RESPONDING } from './';
import type { DatasetApi } from './';

export interface MemoryVolume {
  images: number;
  citations: VolumeCitation[];
  // Astia's re-scan of it, until switched to: its Image count and the pins
  // switching leaves out.
  rescan?: { images: number; stale: StalePin[] };
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
  // What a Discard answers, by citation id.
  discards?: Record<number, CitationLinks>;
  // The Volumes each reference can be put in, by citation id.
  choices?: Record<number, VolumeChoices>;
  // Newest first. `remind` puts a new one first, numbered on from 2000.
  reminders?: Reminder[];
}

export interface MemoryOptions {
  // Every call fails, as when the app can't be reached.
  down?: boolean;
}

type MemoryDatasetApi = DatasetApi & {
  // What was asked, in order: "persons", "families", "person <id>",
  // "links <id>", "mark <citation> <volume>/<image>" (or "<volume>" for
  // only the Volume; " box" or " no box" when it says), "discard <citation>
  // <volume>/<image>", "cite <person> <volume>/<image> <file>[: <text>]",
  // "uncite <citation>", "choices <citation>", "citations <volume>",
  // "images <volume>", "rescan <volume>", "switch <volume>", "reminders",
  // "remind person <id>: <text>" (or "citation <id>", or
  // "<volume>/<image> <file>"), "change reminder <id>", "delete reminder
  // <id>".
  // A Citation made by `cite` joins its Volume's citations, numbered on
  // from 1000, and `uncite` takes one out.
  asked: string[];
};

// An Image's address, as Astia's viewer gives it.
function viewerUrl(volumeId: string, fileId: string) {
  return `memory:viewer/?fileId=${fileId}&aineistoId=${volumeId}`;
}

export function memoryDatasetApi(
  data: MemoryDataset,
  { down = false }: MemoryOptions = {}
): MemoryDatasetApi {
  const asked: string[] = [];
  let made = 1000;
  let reminded = 2000;
  let reminders = [...(data.reminders ?? [])];

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

  // A Citation the Volumes list, with whose it is.
  function citationOf(citationId: number) {
    const rows = Object.values(data.volumes ?? {}).flatMap((v) => v.citations);
    return found(
      rows.find((r) => r.citation.id === citationId),
      'citation not found'
    );
  }

  function onOf(target: ReminderTarget): ReminderOn {
    if ('personId' in target) return { kind: 'person', ...target };
    if ('citationId' in target) {
      const { personId, citation } = citationOf(target.citationId);
      return {
        kind: 'citation',
        personId,
        citationId: citation.id,
        source: citation.source,
        reference: citation.reference ?? citation.entry
      };
    }
    return { kind: 'image', ...target, stale: false };
  }

  function whereOf(target: ReminderTarget) {
    if ('personId' in target) return `person ${target.personId}`;
    if ('citationId' in target) return `citation ${target.citationId}`;
    return `${target.volumeId}/${target.image} ${target.fileId}`;
  }

  function reminder(id: number) {
    return found(
      reminders.find((r) => r.id === id),
      'reminder not found'
    );
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
        `mark ${citationId} ${at.volumeId}${at.image === undefined ? '' : `/${at.image}`}${at.box === undefined ? '' : at.box === null ? ' no box' : ' box'}`,
        undefined,
        () => found(data.marks?.[citationId], 'citation not found')
      ),

    discard: async (citationId, at) =>
      await answer(
        `discard ${citationId} ${at.volumeId}/${at.image}`,
        undefined,
        () => found(data.discards?.[citationId], 'citation not found')
      ),

    cite: async (personId, at) =>
      await answer(
        `cite ${personId} ${at.volumeId}/${at.image} ${at.fileId}${at.text === null ? '' : `: ${at.text}`}`,
        undefined,
        (): VolumeCitation => {
          const { volumeId, image, fileId, box } = at;
          const url = viewerUrl(volumeId, fileId);
          const link: Link = {
            volumeId,
            volume: volumeId,
            url,
            precision: 'entry',
            image,
            box,
            certainty: 'marked'
          };
          made += 1;
          const row: VolumeCitation = {
            personId,
            citation: {
              id: made,
              source: volumeId,
              reference: null,
              entry: `Image\u00a0${image}`,
              page: url,
              url,
              record: null,
              text: at.text,
              churchBook: true,
              madeInApp: true,
              markKey: `citation ${made}`,
              citedPage: null,
              cited: null
            },
            link
          };
          volume(volumeId).citations.push(row);
          return row;
        }
      ),

    async uncite(citationId) {
      await answer(`uncite ${citationId}`, undefined, () => {
        for (const shown of Object.values(data.volumes ?? {})) {
          shown.citations = shown.citations.filter(
            (r) => r.citation.id !== citationId
          );
        }
      });
    },

    volumeChoices: async (citationId, signal) =>
      await answer(`choices ${citationId}`, signal, () =>
        found(data.choices?.[citationId], 'citation not found')
      ),

    volumeCitations: async (volumeId, signal) =>
      await answer(
        `citations ${volumeId}`,
        signal,
        () => volume(volumeId).citations
      ),

    volumeImages: async (volumeId, signal) =>
      await answer(`images ${volumeId}`, signal, () =>
        Array.from({ length: volume(volumeId).images }, (_, i) =>
          viewerUrl(volumeId, `${volumeId}-f${i + 1}`)
        )
      ),

    volumeRescan: async (volumeId, signal) =>
      await answer(`rescan ${volumeId}`, signal, (): Rescan | null => {
        const { images, rescan } = volume(volumeId);
        return rescan === undefined ? null : { cached: images, ...rescan };
      }),

    switchFilming: async (volumeId) =>
      await answer(`switch ${volumeId}`, undefined, () => {
        const shown = volume(volumeId);
        if (shown.rescan !== undefined) {
          shown.images = shown.rescan.images;
          delete shown.rescan;
        }
        return Array.from({ length: shown.images }, (_, i) =>
          viewerUrl(volumeId, `${volumeId}-2-f${i + 1}`)
        );
      }),

    imageUrl: (volumeId, n, retry) =>
      `memory:image/${volumeId}/${n}${retry === 0 ? '' : `?retry=${retry}`}`,

    thumbUrl: (volumeId, n) => `memory:thumb/${volumeId}/${n}`,

    mediaUrl: (storedPath) => `memory:media/${storedPath}`,

    reminders: async (signal) =>
      await answer('reminders', signal, () => [...reminders]),

    remind: async (text, on) =>
      await answer(`remind ${whereOf(on)}: ${text}`, undefined, () => {
        reminded += 1;
        const row: Reminder = {
          id: reminded,
          text: text.trim(),
          on: onOf(on),
          created: new Date().toISOString(),
          done: null
        };
        reminders = [row, ...reminders];
        return row;
      }),

    changeReminder: async (id, change) =>
      await answer(`change reminder ${id}`, undefined, () => {
        const row = reminder(id);
        if (change.text !== undefined) row.text = change.text.trim();
        if (change.done === false) row.done = null;
        if (change.done === true) row.done ??= new Date().toISOString();
        return { ...row };
      }),

    async deleteReminder(id) {
      await answer(`delete reminder ${id}`, undefined, () => {
        reminder(id);
        reminders = reminders.filter((r) => r.id !== id);
      });
    }
  };
}
