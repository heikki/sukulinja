import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi } from '@client/dataset-api';
import type {
  CitationLinks,
  CitationRow,
  Link,
  VolumeCitation
} from '@common/types';

import { Latest } from './latest';
import type { Readable, Selected } from './selected';

// A church-book source opened in the Scan viewer, on one Link of its
// reference.
export interface LinkOpen {
  citation: CitationRow;
  link: Link;
}

// The Volume shown.
export interface VolumeShown {
  id: string;
  label: string;
}

// What the Scan viewer shows. It belongs to the Selected person
// (ADR-0011): selecting someone else closes it.
export interface Viewer {
  // A new object on each `open`, even of the source shown.
  source: Readable<LinkOpen | null>;
  volume: Readable<VolumeShown | null>;
  image: Readable<number>;
  // The length of Astia's list of the Volume's Images; null until it
  // arrives, and if it can't.
  count: Readable<number | null>;
  // The Volume's citations; null until they arrive.
  citations: Readable<VolumeCitation[] | null | 'failed'>;
  // Off the Link's Image. A Link to only the Volume holds anywhere in it.
  away: Readable<boolean>;
  // Whether the dock's Sources list can be seen; the panel says.
  sourcesInView: Readable<boolean>;
  setSourcesInView: (inView: boolean) => void;
  // To the source's Link, even when it shows that source already.
  open: (source: LinkOpen) => void;
  show: (n: number) => void;
  // To the source before or after with a Link, in the panel's order.
  step: (by: 1 | -1) => void;
  // A person picked in the viewer: their id when they aren't the Selected
  // person, for the picker to ask for them.
  pick: (row: VolumeCitation) => number | null;
  // Called by `state.select` once `id` is selected.
  selected: (id: number) => void;
  // Marks a Vision match's Image, throwing ApiError if it's refused.
  confirm: (row: VolumeCitation) => Promise<void>;
  close: () => void;
}

// Image numbers run 1..count; before the count is known, only from 1.
export function clampImage(n: number, count: number | null) {
  const high = count ?? Infinity;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, high));
}

function imageOf(link: Link) {
  return 'image' in link ? link.image : null;
}

// Of a reference's Links resolved again, the one in the Volume marked.
function markedIn(resolved: CitationLinks, volumeId: string) {
  const links = 'links' in resolved ? resolved.links : [];
  return links.find((l) => l.volumeId === volumeId) ?? null;
}

export function openViewer(api: DatasetApi, selected: Selected): Viewer {
  const source = signal<LinkOpen | null>(null);
  const volume = signal<VolumeShown | null>(null);
  const image = signal(1);
  const count = signal<number | null>(null);
  const citations = signal<VolumeCitation[] | null | 'failed'>(null);
  const sourcesInView = signal(false);
  const away = computed(() => {
    const link = source.get()?.link;
    if (link === undefined) return false;
    const at = imageOf(link);
    return (
      volume.get()?.id !== link.volumeId || (at !== null && image.get() !== at)
    );
  });

  const countReq = new Latest();
  const citationsReq = new Latest();
  // A person picked in the viewer, whose citation it goes on with once
  // they're selected.
  let noted: { personId: number; source: LinkOpen } | null = null;

  async function loadCount(volumeId: string) {
    const urls = await countReq.run(
      async (signal) => await api.volumeImages(volumeId, signal)
    );
    if (urls === null || urls === undefined) return;
    count.set(urls.length);
    image.set(clampImage(image.get(), urls.length));
  }

  async function loadCitations(volumeId: string) {
    const rows = await citationsReq.run(
      async (signal) => await api.volumeCitations(volumeId, signal)
    );
    if (rows !== undefined) citations.set(rows ?? 'failed');
  }

  function show(n: number) {
    image.set(clampImage(n, count.get()));
  }

  function open({ citation, link }: LinkOpen) {
    source.set({ citation, link });
    const at = imageOf(link);
    if (volume.get()?.id === link.volumeId) {
      if (at !== null) show(at);
      return;
    }
    volume.set({ id: link.volumeId, label: link.volume });
    image.set(clampImage(at ?? 1, null));
    count.set(null);
    citations.set(null);
    void loadCount(link.volumeId);
    void loadCitations(link.volumeId);
  }

  // Nothing shown, so the next source opens afresh.
  function close() {
    countReq.stop();
    citationsReq.stop();
    source.set(null);
    volume.set(null);
    count.set(null);
    citations.set(null);
  }

  function step(by: 1 | -1) {
    const shown = source.get();
    if (!sourcesInView.get() || shown === null) return;
    const linked = selected.sources.get().flatMap((g) =>
      g.sources.flatMap(({ citation, status }) => {
        const link = status?.link ?? null;
        return link === null ? [] : [{ citation, link }];
      })
    );
    const at = linked.findIndex((l) => l.citation.id === shown.citation.id);
    const next = at < 0 ? undefined : linked[at + by];
    if (next !== undefined) open(next);
  }

  function pick(row: VolumeCitation) {
    const picked = { citation: row.citation, link: row.link };
    if (row.personId === selected.id.get()) {
      open(picked);
      return null;
    }
    noted = { personId: row.personId, source: picked };
    return row.personId;
  }

  function selectedNow(id: number) {
    const going = noted?.personId === id ? noted.source : null;
    noted = null;
    if (going === null) close();
    else open(going);
  }

  // A confirmation moves its row, and a Page pin its neighbours', so the
  // citations reload. The viewer follows the Link in the marked Volume only
  // when the Mark was for its own reference.
  async function confirm(row: VolumeCitation) {
    const shown = volume.get();
    const at = imageOf(row.link);
    if (shown === null || at === null) return;
    const resolved = await selected.mark(row.citation.id, {
      volumeId: shown.id,
      image: at
    });
    const reload = loadCitations(shown.id);
    const current = source.get();
    const link = markedIn(resolved, shown.id);
    if (current?.citation.id === resolved.citationId && link !== null) {
      open({ citation: current.citation, link });
    }
    await reload;
  }

  return {
    source,
    volume,
    image,
    count,
    citations,
    away,
    sourcesInView,
    setSourcesInView(inView) {
      sourcesInView.set(inView);
    },
    open,
    show,
    step,
    pick,
    selected: selectedNow,
    confirm,
    close
  };
}
