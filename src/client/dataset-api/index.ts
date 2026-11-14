// What a dataset's screens ask the app: one method per question, answered
// typed. `openDatasetApi` asks over HTTP, by the dataset's operations
// (common/operations); `memoryDatasetApi` (memory.ts) answers from values
// a test gives.

import { readNdjson } from '@/client/ndjson';
import type {
  BoxAt,
  EntryEdit,
  EntryTarget,
  InEntry,
  InputOf,
  MarkTarget,
  Operations,
  OutputOf
} from '@/common/operations';
import type { MoveTarget } from '@/common/tree-cut';
import type {
  AddedPhoto,
  AssistantEvent,
  AssistantQuestion,
  Box,
  Change,
  ChurchBookArchive,
  CitationLinks,
  CitationRow,
  FactFields,
  FamilyRow,
  NewFact,
  NewRelative,
  PersonDetails,
  PersonName,
  PersonRow,
  PhotoRow,
  Reminder,
  ReminderChange,
  ReminderTarget,
  Rescan,
  VolumeChoices,
  VolumeCitation,
  VolumeContents
} from '@/common/types';

// A request the app answered with an error, or couldn't be reached for. Its
// words are for the person using the app. Anything else thrown is a bug.
export class ApiError extends Error {
  override name = 'ApiError';
}

export const NOT_RESPONDING = 'The app is not responding.';

export type {
  BoxAt,
  EntryAt,
  EntryEdit,
  EntryTarget,
  InEntry,
  MarkTarget
} from '@/common/operations';

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
  // Takes back the reference's Box at `at`, a Mark's or a Match's:
  // its Links, resolved again.
  discard: (citationId: number, at: BoxAt) => Promise<CitationLinks>;
  // Makes an Entry with a Citation of it for each person named (ADR-0026):
  // them as the Volume's citations list them, in the order named.
  citeEntry: (at: EntryTarget, people: InEntry[]) => Promise<VolumeCitation[]>;
  // Changes an Entry as a whole, or refuses all of it (ADR-0026): its
  // Citations as the Volume's citations list them.
  editEntry: (entryId: number, edit: EntryEdit) => Promise<VolumeCitation[]>;
  // Puts what a Citation says: its Entry's, for everyone citing it, else
  // its own.
  retext: (citationId: number, text: string | null) => Promise<void>;
  // Deletes an Entry with all its Citations.
  deleteEntry: (entryId: number) => Promise<void>;
  // Deletes a Citation made in the app.
  uncite: (citationId: number) => Promise<void>;
  // Makes a Citation support one of its person's Facts, or no longer
  // (`on` false): the Citation as it then is.
  support: (
    citationId: number,
    factId: number,
    on: boolean
  ) => Promise<CitationRow>;
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
  // The archives the dataset's church books are in, most cited first.
  archives: (signal?: AbortSignal) => Promise<ChurchBookArchive[]>;
  // How many of the dataset's Citations link into each of a parish
  // archive's Volumes, by Volume id; one with none is left out.
  archiveCitations: (
    archiveId: string,
    signal?: AbortSignal
  ) => Promise<Record<string, number>>;
  // What Astia says of a Volume, in one answer: its Images and its
  // archive.
  volume: (volumeId: string, signal?: AbortSignal) => Promise<VolumeContents>;
  // Astia's re-scan of the Volume not yet switched to, and what switching
  // leaves out; null when there's none.
  volumeRescan: (
    volumeId: string,
    signal?: AbortSignal
  ) => Promise<Rescan | null>;
  // Switches the Volume, `volume` by its label, to Astia's new filming:
  // its Images' viewer URLs.
  switchFilming: (volumeId: string, volume: string) => Promise<string[]>;
  // An Image as the app serves and caches it; `retry` makes a failed load
  // ask again.
  imageUrl: (volumeId: string, n: number, retry: number) => string;
  // Astia's 250px thumbnail of an Image.
  thumbUrl: (volumeId: string, n: number) => string;
  // Every Photo of the dataset, those no one is linked to or tagged in
  // first, then as the import listed them.
  photos: (signal?: AbortSignal) => Promise<PhotoRow[]>;
  // A Photo's file, as the dataset stores it.
  mediaUrl: (storedPath: string) => string;
  // Adds a picture from disk as a Photo linked to no one: it, or the one
  // the dataset has of the same file. Refused for what isn't a picture.
  addPhoto: (file: File) => Promise<AddedPhoto>;
  // Deletes a Photo, its links and its file.
  deletePhoto: (photoId: number) => Promise<void>;
  // Tags the person in the Photo at `box`, or moves their Tag there; the
  // Photo as it is now.
  tag: (photoId: number, personId: number, box: Box) => Promise<PhotoRow>;
  // Takes back the person's Tag in the Photo; the Photo as it is now.
  untag: (photoId: number, personId: number) => Promise<PhotoRow>;
  // Makes the Photo the person's portrait, cropped to their Tag's Box; the
  // Photo as it is now.
  choosePortrait: (photoId: number, personId: number) => Promise<PhotoRow>;
  // Every Change made to the dataset, newest first.
  changes: (signal?: AbortSignal) => Promise<Change[]>;
  // Forgets every Change.
  clearChanges: () => Promise<void>;
  // Every Reminder, newest first, open or done.
  reminders: (signal?: AbortSignal) => Promise<Reminder[]>;
  // Writes a Reminder on the target: it as stored.
  remind: (text: string, on: ReminderTarget) => Promise<Reminder>;
  // Changes a Reminder's text, or marks it done or open again: it as
  // stored.
  changeReminder: (id: number, change: ReminderChange) => Promise<Reminder>;
  deleteReminder: (id: number) => Promise<void>;
  // The places the dataset's Facts name, the most named first.
  places: (signal?: AbortSignal) => Promise<string[]>;
  // Adds a Fact to the person, or to one of their families: its id.
  addFact: (personId: number, fact: NewFact) => Promise<number>;
  // Adds a new person to the tree as the person's relative: their id.
  addRelative: (personId: number, relative: NewRelative) => Promise<number>;
  // Changes the person's name and sex.
  editPerson: (personId: number, name: PersonName) => Promise<void>;
  // Takes the person out of the family, as a child or a parent.
  unlink: (personId: number, familyId: number) => Promise<void>;
  // Moves the person from the family to another, as a child or a parent.
  move: (personId: number, from: number, to: MoveTarget) => Promise<void>;
  // Deletes the person, with all they held.
  deletePerson: (personId: number) => Promise<void>;
  // Changes what one of the person's Facts, or their families', says.
  editFact: (
    personId: number,
    factId: number,
    fields: FactFields
  ) => Promise<void>;
  // Deletes one, its Citations moving to its person or family.
  deleteFact: (personId: number, factId: number) => Promise<void>;
  // Asks the assistant: what it tells of the turn as it runs, the
  // conversation's id first.
  ask: (
    question: AssistantQuestion,
    signal?: AbortSignal
  ) => AsyncGenerator<AssistantEvent, void, undefined>;
  // Forgets a conversation with the assistant.
  forgetConversation: (id: string) => Promise<void>;
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

// Sends a request: the answer, if it's not an error. `what` names the
// request when the app gives no words of its own. Shared with the
// lifecycle adapter (lifecycle.ts).
export function asker(send: (req: Request) => Promise<Response>) {
  return async function ask(what: string, url: string, init: RequestInit = {}) {
    const req = new Request(url, init);
    const res = await send(req).catch((err: unknown) => {
      throw new ApiError(NOT_RESPONDING, { cause: err });
    });
    if (res.ok) return res;
    const words = await res.text().catch(() => '');
    throw new ApiError(words === '' ? `${what} failed (${res.status})` : words);
  };
}

type Answered = {
  [N in keyof Operations]: Operations[N]['answer'] extends 'json' ? N : never;
}[keyof Operations];
type Streamed = Exclude<keyof Operations, Answered>;
type InputOfName<N extends keyof Operations> = InputOf<Operations[N]>;

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

  const ask = asker(send);

  // Sends the operation its input; `what` names it when the app gives no
  // words of its own.
  async function post<N extends keyof Operations>(
    name: N,
    input: InputOfName<N>,
    what: string,
    signal?: AbortSignal
  ) {
    return await ask(what, `${dataset}/api/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal
    });
  }

  // The operation's answer, or none.
  async function call<N extends Answered>(
    name: N,
    input: InputOfName<N>,
    what: string,
    signal?: AbortSignal
  ): Promise<OutputOf<Operations[N]>> {
    return await settled(signal, async () => {
      const res = await post(name, input, what, signal);
      if (res.status === 204) return undefined as OutputOf<Operations[N]>;
      return (await res.json()) as OutputOf<Operations[N]>;
    });
  }

  // The operation's lines, as each comes.
  async function* lines<N extends Streamed>(
    name: N,
    input: InputOfName<N>,
    what: string,
    signal?: AbortSignal
  ): AsyncGenerator<OutputOf<Operations[N]>, void, undefined> {
    const res = await settled(
      signal,
      async () => await post(name, input, what, signal)
    );
    if (res.body === null) throw new ApiError(NOT_RESPONDING);
    try {
      for await (const line of readNdjson(res.body)) {
        signal?.throwIfAborted();
        yield line as OutputOf<Operations[N]>;
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the abort's own reason
      if (signal?.aborted === true) throw signal.reason;
      // A line that isn't JSON is a bug; a stream cut off isn't.
      if (err instanceof SyntaxError) throw err;
      throw new ApiError(NOT_RESPONDING, { cause: err });
    }
  }

  return {
    persons: async (signal) => await call('persons', {}, 'persons', signal),
    families: async (signal) => await call('families', {}, 'families', signal),
    person: async (personId, signal) =>
      await call('person', { personId }, 'person', signal),
    personLinks: (personId, signal) =>
      lines('personLinks', { personId }, 'Links', signal),
    mark: async (citationId, at) =>
      await call('mark', { citationId, at }, 'Mark'),
    discard: async (citationId, at) =>
      await call('discard', { citationId, at }, 'Discard'),
    citeEntry: async (at, people) =>
      await call('citeEntry', { at, people }, 'Citing'),
    editEntry: async (entryId, edit) =>
      await call('editEntry', { entryId, edit }, 'Saving'),
    async retext(citationId, text) {
      await call('retext', { citationId, text }, 'Saving');
    },
    async deleteEntry(entryId) {
      await call('deleteEntry', { entryId }, 'Deleting');
    },
    async uncite(citationId) {
      await call('uncite', { citationId }, 'Deleting');
    },
    support: async (citationId, factId, on) =>
      await call('support', { citationId, factId, on }, 'Saving'),
    volumeChoices: async (citationId, signal) =>
      await call('volumeChoices', { citationId }, 'the Volumes', signal),
    volumeCitations: async (volumeId, signal) =>
      await call(
        'volumeCitations',
        { volumeId },
        "the Volume's citations",
        signal
      ),
    archives: async (signal) =>
      await call('archives', {}, 'the church books', signal),
    archiveCitations: async (archiveId, signal) =>
      await call(
        'archiveCitations',
        { archiveId },
        "the parish's citations",
        signal
      ),
    volume: async (volumeId, signal) =>
      await call('volume', { volumeId }, 'the Volume', signal),

    // Astia's, not the dataset's: shared by every dataset.
    async volumeRescan(volumeId, signal) {
      return await settled(signal, async () => {
        const url = `${astia}/${volumeId}/rescan`;
        const res = await ask("the Volume's re-scan", url, { signal });
        return ((await res.json()) as { rescan: Rescan | null }).rescan;
      });
    },

    switchFilming: async (volumeId, volume) =>
      await call('switchFilming', { volumeId, volume }, 'Switching'),

    imageUrl(volumeId, n, retry) {
      const url = `${astia}/${volumeId}/images/${n}`;
      return retry === 0 ? url : `${url}?retry=${retry}`;
    },

    thumbUrl: (volumeId, n) => `${astia}/${volumeId}/images/${n}?size=thumb`,

    photos: async (signal) => await call('photos', {}, 'Photos', signal),

    mediaUrl: (storedPath) => `${dataset}/media/${storedPath}`,

    // The file goes as a form, not as an operation's JSON.
    async addPhoto(file) {
      const body = new FormData();
      body.append('file', file);
      const res = await ask(`Adding ${file.name}`, `${dataset}/api/addPhoto`, {
        method: 'POST',
        body
      });
      return (await res.json()) as AddedPhoto;
    },

    async deletePhoto(photoId) {
      await call('deletePhoto', { photoId }, 'Deleting the photo');
    },
    tag: async (photoId, personId, box) =>
      await call('tag', { photoId, personId, box }, 'Saving the Tag'),
    untag: async (photoId, personId) =>
      await call('untag', { photoId, personId }, 'Taking back the Tag'),
    choosePortrait: async (photoId, personId) =>
      await call(
        'choosePortrait',
        { photoId, personId },
        'Choosing the portrait'
      ),
    changes: async (signal) => await call('changes', {}, 'Changes', signal),
    async clearChanges() {
      await call('clearChanges', {}, 'Clearing the Changes');
    },
    reminders: async (signal) =>
      await call('reminders', {}, 'Reminders', signal),
    remind: async (text, on) =>
      await call('remind', { text, on }, 'Saving the Reminder'),
    changeReminder: async (id, change) =>
      await call('changeReminder', { id, change }, 'Saving the Reminder'),
    async deleteReminder(id) {
      await call('deleteReminder', { id }, 'Deleting the Reminder');
    },
    places: async (signal) => await call('places', {}, 'Places', signal),
    async editPerson(personId, name) {
      await call('editPerson', { personId, name }, 'Changing the name');
    },
    async unlink(personId, familyId) {
      await call('unlink', { personId, familyId }, 'Removing from the family');
    },
    async move(personId, from, to) {
      await call('move', { personId, from, to }, 'Moving the person');
    },
    async deletePerson(personId) {
      await call('deletePerson', { personId }, 'Deleting the person');
    },
    addRelative: async (personId, relative) =>
      await call('addRelative', { personId, relative }, 'Adding the person'),
    addFact: async (personId, fact) =>
      await call('addFact', { personId, fact }, 'Adding the event'),
    async editFact(personId, factId, fields) {
      await call('editFact', { personId, factId, fields }, 'Saving the event');
    },
    async deleteFact(personId, factId) {
      await call('deleteFact', { personId, factId }, 'Deleting the event');
    },
    ask: (question, signal) =>
      lines('ask', question, 'Asking the assistant', signal),
    async forgetConversation(id) {
      await call('forgetConversation', { id }, 'Starting a new conversation');
    }
  };
}
