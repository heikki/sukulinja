import { computed, signal } from '@lit-labs/signals';

import { ApiError } from '@client/dataset-api';
import type { BoxAt, DatasetApi, MarkTarget } from '@client/dataset-api';
import type {
  CitationLinks,
  LinkResolution,
  PersonDetails
} from '@common/types';

import { groupSources } from './sources';
import type { SourceGroup } from './sources';

// A signal as its readers see it; only the store's verbs change it.
export interface Readable<T> {
  get: () => T;
}

// The Selected person: who they are, their details, and the Links of their
// church-book references as they stream in.
export interface Selected {
  id: Readable<number | null>;
  // The last person's stay until the new person's arrive with their Links,
  // or `grace` has passed, so the panel changes once rather than as each
  // Link streams in.
  details: Readable<PersonDetails | null>;
  // The app's words when the details couldn't load.
  error: Readable<string | null>;
  // By citation id.
  links: Readable<Map<number, LinkResolution>>;
  // The Links are still streaming.
  pending: Readable<boolean>;
  // The details' sources in the panel's order, each with its link status.
  sources: Readable<SourceGroup[]>;
  // Resolves once their details and Links are in, or the next selection
  // takes over.
  select: (id: number) => Promise<void>;
  // Saves a Mark, throwing ApiError if it's refused; the reference's Links,
  // resolved again.
  mark: (citationId: number, at: MarkTarget) => Promise<CitationLinks>;
  // Takes back a reference's Box, as `mark` saves one.
  discard: (citationId: number, at: BoxAt) => Promise<CitationLinks>;
}

// Long enough for Links the server has resolved before; ones it must ask
// Astia for stream in after.
const GRACE_MS = 250;

export function openSelected(
  api: DatasetApi,
  { grace = GRACE_MS }: { grace?: number } = {}
): Selected {
  const id = signal<number | null>(null);
  const details = signal<PersonDetails | null>(null);
  const error = signal<string | null>(null);
  const links = signal(new Map<number, LinkResolution>());
  const pending = signal(false);
  const sources = computed(() => {
    const d = details.get();
    return d === null
      ? []
      : groupSources(d.citations, links.get(), pending.get());
  });

  // The details asked for, and the Links streaming; each ask aborts the
  // last.
  let detailsAbort: AbortController | null = null;
  let linksAbort: AbortController | null = null;

  function setLinks(line: CitationLinks) {
    const { citationId, ...resolution } = line;
    links.set(new Map(links.get()).set(citationId, resolution));
  }

  // One stream at a time. With `arrived`, the new person's details, their
  // Links are gathered and shown with them, all at once; without, the
  // Links known stay until their new ones arrive.
  async function loadLinks(person: number, arrived: PersonDetails | null) {
    linksAbort?.abort();
    const abort = new AbortController();
    linksAbort = abort;
    const gathered = new Map<number, LinkResolution>();
    let shown = arrived === null;
    function show() {
      if (shown || abort.signal.aborted) return;
      shown = true;
      details.set(arrived);
      error.set(null);
      links.set(gathered);
      pending.set(true);
    }
    if (shown) pending.set(true);
    const timer = shown ? undefined : setTimeout(show, grace);
    try {
      for await (const line of api.personLinks(person, abort.signal)) {
        if (shown) {
          setLinks(line);
        } else {
          const { citationId, ...resolution } = line;
          gathered.set(citationId, resolution);
        }
      }
    } catch (err) {
      // Unresolved references show as unavailable once pending clears.
      if (!abort.signal.aborted && !(err instanceof ApiError)) throw err;
    } finally {
      clearTimeout(timer);
      if (!abort.signal.aborted) {
        show();
        pending.set(false);
      }
    }
  }

  async function select(next: number) {
    if (next === id.get()) return;
    id.set(next);
    detailsAbort?.abort();
    linksAbort?.abort();
    const abort = new AbortController();
    detailsAbort = abort;
    const arrived = await api
      .person(next, abort.signal)
      .catch((err: unknown) => {
        if (abort.signal.aborted) return null;
        if (!(err instanceof ApiError)) throw err;
        error.set(err.message);
        return null;
      });
    if (arrived !== null) await loadLinks(next, arrived);
  }

  // A Page pin can move the person's other references in the Volume too,
  // and a Record pin taken back theirs citing the record, so their Links
  // reload.
  async function settled(saving: Promise<CitationLinks>) {
    const resolved = await saving;
    setLinks(resolved);
    const person = id.get();
    if (person !== null) void loadLinks(person, null);
    return resolved;
  }

  async function mark(citationId: number, at: MarkTarget) {
    return await settled(api.mark(citationId, at));
  }

  async function discard(citationId: number, at: BoxAt) {
    return await settled(api.discard(citationId, at));
  }

  return {
    id,
    details,
    error,
    links,
    pending,
    sources,
    select,
    mark,
    discard
  };
}
