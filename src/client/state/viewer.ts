import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi } from '@client/dataset-api';
import type {
  Box,
  CitationLinks,
  CitationRow,
  Link,
  VolumeChoice,
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

// A change to the current source's Link, not saved yet: the Volume it
// will be in, and the Image when one is marked, with where on it the entry
// is drawn.
export interface PendingLink {
  volumeId: string;
  volume: string;
  image?: number;
  box?: Box;
}

// What leaving the source with a change pending waits on.
export type LeaveAnswer = 'save' | 'discard' | 'keep';

// What the Scan viewer shows. It belongs to the Selected person
// (ADR-0011): selecting someone else closes it. Opening another source,
// stepping and closing wait, while a change is pending, until it's saved
// or discarded.
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
  // The current source's change not saved yet.
  pending: Readable<PendingLink | null>;
  // A way out of the source is waiting on `answer`.
  leaving: Readable<boolean>;
  // Puts the source in the Volume, pending, and shows it there. Its own
  // Volume, unless it's one of several, is no change.
  changeVolume: (choice: VolumeChoice) => void;
  // Whether `markImage` would change the pending or saved Link.
  canMarkImage: Readable<boolean>;
  // Puts the source on the Image shown, pending.
  markImage: () => void;
  // The entry Box on the Image shown: pending, else the Link's.
  boxHere: Readable<Box | null>;
  // Whether the Box shown is the pending one, which can be adjusted.
  boxPending: Readable<boolean>;
  // Puts the source's entry at the Box, on the Image shown, pending.
  setBox: (box: Box) => void;
  // Starts a pending change from the Link's own Box, to adjust it.
  editBox: () => void;
  // Takes the entry Box off, pending, leaving the Image marked.
  removeBox: () => void;
  // Drops the pending change, back to the Link.
  cancel: () => void;
  // Saves the pending change as a Mark and follows the new Link, throwing
  // ApiError if it's refused.
  save: () => Promise<void>;
  // Runs `go` now, or once the pending change is saved or discarded;
  // `stay` runs if the person keeps editing instead.
  leave: (go: () => void, stay?: () => void) => void;
  // Saving can throw, as `save` does; the way out then still waits.
  answer: (answer: LeaveAnswer) => Promise<void>;
}

// Image numbers run 1..count; before the count is known, only from 1.
export function clampImage(n: number, count: number | null) {
  const high = count ?? Infinity;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, high));
}

function imageOf(link: Link) {
  return 'image' in link ? link.image : null;
}

// The Box of a Link or pending change, if it's on that Image.
function boxOn(
  at: { volumeId: string; image?: number; box?: Box },
  on: { volumeId: string; image: number }
) {
  const here = at.volumeId === on.volumeId && at.image === on.image;
  return here ? (at.box ?? null) : null;
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
  const pending = signal<PendingLink | null>(null);
  const leaving = signal(false);
  // The way out waiting on an answer, and what keeping on editing does.
  let held: { go: () => void; stay?: () => void } | null = null;
  // The Image shown, unless the source is already there by hand or has it
  // pending. An estimate or a Vision match there is still a change.
  const canMarkImage = computed(() => {
    const link = source.get()?.link;
    const shown = volume.get();
    if (link === undefined || shown === null) return false;
    const at = image.get();
    const change = pending.get();
    if (change !== null) {
      return change.volumeId !== shown.id || change.image !== at;
    }
    return !(
      link.volumeId === shown.id &&
      link.certainty === 'marked' &&
      imageOf(link) === at
    );
  });
  // Where the pending change or the Link puts the entry on the Image shown.
  const boxHere = computed(() => {
    const shown = volume.get();
    if (shown === null) return null;
    const on = { volumeId: shown.id, image: image.get() };
    const change = pending.get();
    if (change !== null) return boxOn(change, on);
    const link = source.get()?.link;
    return link?.precision === 'entry' ? boxOn(link, on) : null;
  });
  const boxPending = computed(
    () => boxHere.get() !== null && pending.get() !== null
  );
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

  // A Volume already shown stays on its Image unless `at` gives one.
  function showVolume(id: string, label: string, at: number | null) {
    if (volume.get()?.id === id) {
      if (at !== null) show(at);
      return;
    }
    volume.set({ id, label });
    image.set(clampImage(at ?? 1, null));
    count.set(null);
    citations.set(null);
    void loadCount(id);
    void loadCitations(id);
  }

  function openNow({ citation, link }: LinkOpen) {
    pending.set(null);
    source.set({ citation, link });
    showVolume(link.volumeId, link.volume, imageOf(link));
  }

  // Nothing shown, so the next source opens afresh.
  function closeNow() {
    countReq.stop();
    citationsReq.stop();
    pending.set(null);
    held = null;
    leaving.set(false);
    source.set(null);
    volume.set(null);
    count.set(null);
    citations.set(null);
  }

  function leave(go: () => void, stay?: () => void) {
    if (pending.get() === null) {
      go();
      return;
    }
    held = stay === undefined ? { go } : { go, stay };
    leaving.set(true);
  }

  function open(next: LinkOpen) {
    leave(() => {
      openNow(next);
    });
  }

  function close() {
    leave(closeNow);
  }

  function isSplit(citationId: number) {
    const resolution = selected.links.get().get(citationId);
    return (
      resolution !== undefined &&
      'links' in resolution &&
      resolution.links.length > 1
    );
  }

  function changeVolume(choice: VolumeChoice) {
    const shown = source.get();
    if (shown === null) return;
    const { link } = shown;
    const settled = !isSplit(shown.citation.id) || link.certainty === 'marked';
    if (choice.id === link.volumeId && settled) {
      openNow(shown);
      return;
    }
    pending.set({ volumeId: choice.id, volume: choice.label });
    showVolume(choice.id, choice.label, null);
  }

  function markImage() {
    const shown = volume.get();
    if (source.get() === null || shown === null || !canMarkImage.get()) {
      return;
    }
    pending.set({
      volumeId: shown.id,
      volume: shown.label,
      image: image.get()
    });
  }

  function setBox(box: Box) {
    const shown = volume.get();
    if (source.get() === null || shown === null) return;
    pending.set({
      volumeId: shown.id,
      volume: shown.label,
      image: image.get(),
      box
    });
  }

  function editBox() {
    const box = boxHere.get();
    if (box !== null && pending.get() === null) setBox(box);
  }

  // Off a pending Box, or off the Link's own.
  function removeBox() {
    const box = boxHere.get();
    const shown = volume.get();
    if (box === null || shown === null) return;
    const change = pending.get();
    const { volumeId, volume: label } = change ?? {
      volumeId: shown.id,
      volume: shown.label
    };
    pending.set({ volumeId, volume: label, image: image.get() });
  }

  function cancel() {
    const shown = source.get();
    if (shown !== null) openNow(shown);
  }

  // The Mark reloads the Volume's citations, as a confirmation does, and
  // the viewer follows the new Link.
  async function save() {
    const shown = source.get();
    const change = pending.get();
    if (shown === null || change === null) return;
    const { volumeId, image: at, box } = change;
    const resolved = await selected.mark(
      shown.citation.id,
      at === undefined
        ? { volumeId }
        : { volumeId, image: at, box: box ?? null }
    );
    const link = markedIn(resolved, volumeId);
    if (source.get() !== shown) return;
    pending.set(null);
    const reload = loadCitations(volume.get()?.id ?? volumeId);
    if (link !== null) openNow({ citation: shown.citation, link });
    await reload;
  }

  async function answer(given: LeaveAnswer) {
    if (given === 'save') await save();
    else if (given === 'discard') pending.set(null);
    const waiting = held;
    held = null;
    leaving.set(false);
    if (given === 'keep') waiting?.stay?.();
    else waiting?.go();
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
    if (going === null) closeNow();
    else openNow(going);
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
      openNow({ citation: current.citation, link });
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
    close,
    pending,
    leaving,
    changeVolume,
    canMarkImage,
    markImage,
    boxHere,
    boxPending,
    setBox,
    editBox,
    removeBox,
    cancel,
    save,
    leave,
    answer
  };
}
