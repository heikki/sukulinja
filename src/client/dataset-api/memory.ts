// Test support: a Dataset API answering from values the test gives, so app
// state runs without a server. It fails as the app does: unknown people,
// Volumes and Marks throw ApiError with the server's words.

import type {
  AddedPhoto,
  Change,
  ChurchBookArchive,
  CitationLinks,
  FamilyRow,
  Link,
  PersonDetails,
  PersonRow,
  PhotoRow,
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
  // The title of the archive it's in.
  archive?: string;
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
  // Newest first, as given: nothing done here writes one.
  changes?: Change[];
  // The places Facts name, as given.
  places?: string[];
  // The archives the church books are in, as given.
  archives?: ChurchBookArchive[];
  // By Photo id: what `tag` and `untag` change, `addPhoto` adds to,
  // numbered on from 5000 with its file name as its path, `deletePhoto`
  // takes out, and `photos` lists by id.
  photos?: Record<number, PhotoRow>;
}

export interface MemoryOptions {
  // Every call fails, as when the app can't be reached.
  down?: boolean;
}

type MemoryDatasetApi = DatasetApi & {
  // What was asked, in order: "persons", "families", "person <id>",
  // "links <id>", "mark <citation> <volume>/<image>" (or "<volume>" for
  // only the Volume; " box" or " no box" when it says), "discard <citation>
  // <volume>/<image>", "cite <person> <volume>/<image> <file>[ as <role>][: <text>]",
  // "uncite <citation>", "choices <citation>", "citations <volume>",
  // "volume <volume>", "rescan <volume>", "switch <volume>", "changes",
  // "reminders", "remind person <id>: <text>" (or "<volume>/<image>
  // <file>"), "change reminder <id>", "delete reminder <id>", "tag
  // <photo> <person>", "untag <photo> <person>", "portrait <photo>
  // <person>", "photos", "places", "add fact <person> <tag>[ in <family>]: <date>",
  // "edit fact <person> <fact>: <date>", "delete fact <person> <fact>",
  // "add photo <file name>", "delete photo <photo>".
  // `addFact` answers ids numbered on from 3000; Facts don't change the
  // details given. "add <relation> of <person>: <given> <surname>" or
  // "link <relation> of <person>: <relative>", "edit person <person>:
  // <given> <surname> <sex>", which changes the row in `persons`: a new person `addRelative`
  // adds joins `persons`, numbered on from 4000, in no family; a link
  // changes nothing.
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
  let factsAdded = 3000;
  let personsAdded = 4000;
  const persons = [...(data.persons ?? [])];
  let reminders = [...(data.reminders ?? [])];
  let changes = [...(data.changes ?? [])];
  const photos = new Map(
    Object.entries(data.photos ?? {}).map(([id, p]) => [Number(id), p])
  );

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

  function onOf(target: ReminderTarget): ReminderOn {
    if ('volumeId' in target) {
      return {
        kind: 'image',
        ...target,
        stale: false,
        personId: target.personId ?? null
      };
    }
    return { kind: 'person', personId: target.personId };
  }

  function whereOf(target: ReminderTarget) {
    if ('volumeId' in target) {
      const of = target.personId === undefined ? '' : ` of ${target.personId}`;
      return `${target.volumeId}/${target.image} ${target.fileId}${of}`;
    }
    return `person ${target.personId}`;
  }

  function reminder(id: number) {
    return found(
      reminders.find((r) => r.id === id),
      'reminder not found'
    );
  }

  function photo(id: number) {
    return found(photos.get(id), 'photo not found');
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
      await answer('persons', signal, () => [...persons]),

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
        `cite ${personId} ${at.volumeId}/${at.image} ${at.fileId}${at.role === null ? '' : ` as ${at.role}`}${at.text === null ? '' : `: ${at.text}`}`,
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

    // Every Volume given is taken as the archive's.
    archives: async (signal) =>
      await answer('archives', signal, () => [...(data.archives ?? [])]),

    archiveCitations: async (archiveId, signal) =>
      await answer(`archive citations ${archiveId}`, signal, () =>
        Object.fromEntries(
          Object.entries(data.volumes ?? {})
            .filter(([, v]) => v.citations.length > 0)
            .map(([id, v]) => [id, v.citations.length])
        )
      ),

    volume: async (volumeId, signal) =>
      await answer(`volume ${volumeId}`, signal, () => {
        const shown = volume(volumeId);
        return {
          images: Array.from({ length: shown.images }, (_, i) =>
            viewerUrl(volumeId, `${volumeId}-f${i + 1}`)
          ),
          archive: shown.archive ?? null
        };
      }),

    volumeRescan: async (volumeId, signal) =>
      await answer(`rescan ${volumeId}`, signal, (): Rescan | null => {
        const { images, rescan } = volume(volumeId);
        return rescan === undefined ? null : { cached: images, ...rescan };
      }),

    switchFilming: async (volumeId, _volume) =>
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

    photos: async (signal) =>
      await answer('photos', signal, () =>
        structuredClone([...photos.values()])
      ),

    mediaUrl: (storedPath) => `memory:media/${storedPath}`,

    addPhoto: async (file) =>
      await answer(`add photo ${file.name}`, undefined, (): AddedPhoto => {
        if (!file.type.startsWith('image/')) {
          throw new ApiError(`${file.name} isn't a picture`);
        }
        const had = [...photos.values()].find((p) => p.path === file.name);
        if (had !== undefined) {
          return { photo: structuredClone(had), already: true };
        }
        const added = { id: 5000 + photos.size, path: file.name, people: [] };
        photos.set(added.id, added);
        return { photo: structuredClone(added), already: false };
      }),

    async deletePhoto(photoId) {
      await answer(`delete photo ${photoId}`, undefined, () => {
        photo(photoId);
        photos.delete(photoId);
      });
    },

    tag: async (photoId, personId, box) =>
      await answer(`tag ${photoId} ${personId}`, undefined, () => {
        const shown = photo(photoId);
        const had = shown.people.find((p) => p.personId === personId);
        const tag = { personId, box };
        shown.people =
          had === undefined
            ? [...shown.people, tag]
            : shown.people.map((p) => (p === had ? tag : p));
        return structuredClone(shown);
      }),

    untag: async (photoId, personId) =>
      await answer(`untag ${photoId} ${personId}`, undefined, () => {
        const shown = photo(photoId);
        if (
          !shown.people.some((p) => p.personId === personId && p.box !== null)
        ) {
          throw new ApiError('tag not found');
        }
        shown.people = shown.people.filter(
          (p) => p.personId !== personId || p.box === null
        );
        return structuredClone(shown);
      }),

    choosePortrait: async (photoId, personId) =>
      await answer(`portrait ${photoId} ${personId}`, undefined, () => {
        const shown = photo(photoId);
        if (
          !shown.people.some((p) => p.personId === personId && p.box !== null)
        ) {
          throw new ApiError('tag not found');
        }
        return structuredClone(shown);
      }),

    changes: async (signal) =>
      await answer('changes', signal, () => [...changes]),

    async clearChanges() {
      await answer('clear changes', undefined, () => {
        changes = [];
      });
    },

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
    },

    places: async (signal) =>
      await answer('places', signal, () => [...(data.places ?? [])]),

    addFact: async (personId, fact) =>
      await answer(
        `add fact ${personId} ${fact.tag}${fact.familyId === null ? '' : ` in ${fact.familyId}`}: ${fact.date}`,
        undefined,
        () => {
          factsAdded += 1;
          return factsAdded;
        }
      ),

    addRelative: async (personId, { relation, who }) =>
      await answer(
        'personId' in who
          ? `link ${relation} of ${personId}: ${who.personId}`
          : `add ${relation} of ${personId}: ${who.given} ${who.surname}`,
        undefined,
        () => {
          found(
            persons.find((p) => p.id === personId),
            'person not found'
          );
          if ('personId' in who) return who.personId;
          personsAdded += 1;
          persons.push({
            id: personsAdded,
            given: who.given,
            surname: who.surname,
            sex: who.sex,
            birth_year: null,
            death_year: null,
            birth_date: null,
            death_date: null,
            died: false,
            photo_path: null,
            crop: null
          });
          return personsAdded;
        }
      ),

    async editPerson(personId, name) {
      await answer(
        `edit person ${personId}: ${name.given} ${name.surname} ${name.sex}`,
        undefined,
        () => {
          const at = persons.findIndex((p) => p.id === personId);
          const row = found(persons[at], 'person not found');
          persons[at] = { ...row, ...name };
        }
      );
    },

    async editFact(personId, factId, fields) {
      await answer(
        `edit fact ${personId} ${factId}: ${fields.date}`,
        undefined,
        () => undefined
      );
    },

    async deleteFact(personId, factId) {
      await answer(
        `delete fact ${personId} ${factId}`,
        undefined,
        () => undefined
      );
    }
  };
}
