import { computed, signal } from '@lit-labs/signals';

import { ApiError } from '@client/dataset-api';
import type { DatasetApi } from '@client/dataset-api';
import type {
  Box,
  CitationRow,
  Link,
  LinkResolution,
  Rescan,
  UnlinkedResolution,
  VolumeChoice,
  VolumeCitation
} from '@common/types';

import { Latest } from './latest';
import type { Readable, Selected } from './selected';

// A church-book source opened in the Scan viewer, on one Link of its
// reference, or with none, to look through its parish's Volumes for it:
// `unlinked` says why it has none.
export type LinkOpen =
  | { citation: CitationRow; link: Link }
  | { citation: CitationRow; link: null; unlinked: UnlinkedResolution };

// The Volume shown.
export interface VolumeShown {
  id: string;
  label: string;
}

// A change to the current source's Link, not saved yet: where on an Image
// of a Volume the entry is. With `cite`, it's a new Citation of the entry
// for the person instead, saying what the entry is.
export interface PendingLink {
  volumeId: string;
  volume: string;
  image: number;
  box: Box;
  cite?: { personId: number; text: string };
}

// What leaving the source with a change pending waits on.
export type LeaveAnswer = 'save' | 'discard' | 'keep';

// What the Scan viewer shows. It belongs to the Selected person
// (ADR-0011): selecting someone else closes it. While a change is pending,
// anything moving off its Image waits until it's saved or discarded:
// opening another source, stepping, showing another Image or Volume, and
// closing.
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
  // Off the Link's Image. A Link to only the Volume holds anywhere in it;
  // with no Link, nothing is away.
  away: Readable<boolean>;
  // Whether the dock's Sources list can be seen; the panel says.
  sourcesInView: Readable<boolean>;
  setSourcesInView: (inView: boolean) => void;
  // To the source's Link, even when it shows that source already; with
  // none, to no Volume until one is chosen.
  open: (source: LinkOpen) => void;
  // To Image `n` of the Volume shown.
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
  // Shows the Volume, without changing the source's Link; back in the
  // Link's own Volume, on its Image. With no Link, the first Volume shown
  // opens on its first Image.
  changeVolume: (choice: VolumeChoice) => void;
  // The entry Box on the Image shown: pending, else the Link's.
  boxHere: Readable<Box | null>;
  // Whether the Box shown is the pending one, which can be adjusted.
  boxPending: Readable<boolean>;
  // Puts the source's entry at the Box, on the Image shown, pending.
  setBox: (box: Box) => void;
  // Starts a pending change from the Link's own Box, to adjust it.
  editBox: () => void;
  // Puts a new Citation of the entry at the Box for the person, on the
  // Image shown, pending.
  citeFor: (personId: number, box: Box) => void;
  // What the pending Citation's entry is, as typed.
  setCiteText: (text: string) => void;
  // A Discard of the Link's Box on the Image shown, waiting to be saved.
  // Moving off the Image drops it.
  discarding: Readable<boolean>;
  // Asks to take back the Link's Box on the Image shown.
  discard: () => void;
  // Drops the pending change, back to the Link, or the Discard asked for.
  cancel: () => void;
  // Takes the Box back, throwing ApiError if it's refused, and goes on
  // with the Link it leaves, on the Image shown. For a Citation made in
  // the app, deletes it instead, and the viewer closes.
  confirmDiscard: () => Promise<void>;
  // Saves the pending change as a Mark and follows the new Link, or makes
  // the pending Citation and stays where it is, throwing ApiError if it's
  // refused.
  save: () => Promise<void>;
  // Runs `go` now, or once the pending change is saved or discarded;
  // `stay` runs if the person keeps editing instead.
  leave: (go: () => void, stay?: () => void) => void;
  // Saving can throw, as `save` does; the way out then still waits.
  answer: (answer: LeaveAnswer) => Promise<void>;
  // Astia's re-scan of the Volume shown, not switched to yet: asked about
  // when the Volume is shown, and again when an Image of it fails if that
  // got no answer.
  rescan: Readable<Rescan | null>;
  // The Volume shown is known to be re-scanned and not switched to, asked
  // or kept: its Images not on disk can't load, and it's read-only.
  oldFilming: Readable<boolean>;
  // Brings the question about the old filming back, as after Not now.
  askAgain: () => void;
  // An Image of the Volume shown couldn't load.
  imageFailed: () => Promise<void>;
  // Switches the Volume shown to Astia's new filming, throwing ApiError if
  // it fails. Its Images, citations and the Links reload, and the viewer
  // follows the source's Link there.
  switchFilming: () => Promise<void>;
  // Stays on the filming shown; asked again when the Volume is next shown.
  keepFilming: () => void;
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

// The file id in an Image's address in Astia's viewer.
function fileIdOf(url: string | undefined) {
  return url === undefined
    ? null
    : (/[?&]fileId=(?<id>[^&]+)/.exec(url)?.groups?.id ?? null);
}

// Of a reference's Links resolved again, the one in the Volume marked.
function markedIn(resolved: LinkResolution, volumeId: string) {
  const links = 'links' in resolved ? resolved.links : [];
  return links.find((l) => l.volumeId === volumeId) ?? null;
}

export function openViewer(api: DatasetApi, selected: Selected): Viewer {
  const source = signal<LinkOpen | null>(null);
  const volume = signal<VolumeShown | null>(null);
  const image = signal(1);
  const count = signal<number | null>(null);
  // Astia's viewer address of each of the Volume's Images.
  let files: string[] = [];
  const citations = signal<VolumeCitation[] | null | 'failed'>(null);
  const sourcesInView = signal(false);
  const pending = signal<PendingLink | null>(null);
  const discarding = signal(false);
  const leaving = signal(false);
  const rescan = signal<Rescan | null>(null);
  // Astia's re-scan of the Volume shown, kept after Not now.
  const known = signal<Rescan | null>(null);
  const oldFilming = computed(() => known.get() !== null);
  // The Volume shown, once Astia answered whether it was re-scanned.
  const answered = new Set<string>();
  // The way out waiting on an answer, and what keeping on editing does.
  let held: { go: () => void; stay?: () => void } | null = null;
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
    const link = source.get()?.link ?? null;
    if (link === null) return false;
    const at = imageOf(link);
    return (
      volume.get()?.id !== link.volumeId || (at !== null && image.get() !== at)
    );
  });

  const countReq = new Latest();
  const citationsReq = new Latest();
  const rescanReq = new Latest();
  // A person picked in the viewer, whose citation it goes on with once
  // they're selected.
  let noted: { personId: number; source: LinkOpen } | null = null;

  async function loadCount(volumeId: string) {
    const urls = await countReq.run(
      async (signal) => await api.volumeImages(volumeId, signal)
    );
    if (urls === null || urls === undefined) return;
    files = urls;
    count.set(urls.length);
    image.set(clampImage(image.get(), urls.length));
  }

  async function loadCitations(volumeId: string) {
    const rows = await citationsReq.run(
      async (signal) => await api.volumeCitations(volumeId, signal)
    );
    if (rows !== undefined) citations.set(rows ?? 'failed');
  }

  function showNow(n: number) {
    discarding.set(false);
    image.set(clampImage(n, count.get()));
  }

  function forgetRescan() {
    rescanReq.stop();
    answered.clear();
    rescan.set(null);
    known.set(null);
  }

  // A Volume already shown stays on its Image unless `at` gives one.
  function showVolume(id: string, label: string, at: number | null) {
    if (volume.get()?.id === id) {
      if (at !== null) showNow(at);
      return;
    }
    forgetRescan();
    discarding.set(false);
    volume.set({ id, label });
    image.set(clampImage(at ?? 1, null));
    count.set(null);
    files = [];
    citations.set(null);
    void loadCount(id);
    void loadCitations(id);
    void askRescan(id);
  }

  // Nothing of a Volume shown, as before the first is chosen.
  function showNoVolume() {
    forgetRescan();
    countReq.stop();
    citationsReq.stop();
    volume.set(null);
    image.set(1);
    count.set(null);
    citations.set(null);
  }

  function openNow(next: LinkOpen) {
    pending.set(null);
    discarding.set(false);
    source.set({ ...next });
    const { link } = next;
    if (link === null) showNoVolume();
    else showVolume(link.volumeId, link.volume, imageOf(link));
  }

  // Nothing shown, so the next source opens afresh.
  function closeNow() {
    pending.set(null);
    discarding.set(false);
    held = null;
    leaving.set(false);
    source.set(null);
    showNoVolume();
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

  function show(n: number) {
    if (clampImage(n, count.get()) === image.get()) return;
    leave(() => {
      showNow(n);
    });
  }

  function changeVolume(choice: VolumeChoice) {
    const shown = source.get();
    if (shown === null) return;
    const { link } = shown;
    const own =
      link !== null && choice.id === link.volumeId ? imageOf(link) : null;
    leave(() => {
      showVolume(choice.id, choice.label, own);
    });
  }

  // A Volume on a filming Astia replaced is read-only until switched. A
  // pending Citation stays one as its Box moves.
  function setBox(box: Box) {
    const shown = volume.get();
    if (source.get() === null || shown === null || oldFilming.get()) return;
    discarding.set(false);
    const cite = pending.get()?.cite;
    pending.set({
      volumeId: shown.id,
      volume: shown.label,
      image: image.get(),
      box,
      ...(cite === undefined ? {} : { cite })
    });
  }

  function citeFor(personId: number, box: Box) {
    pending.set(null);
    setBox(box);
    const change = pending.get();
    if (change !== null) {
      pending.set({ ...change, cite: { personId, text: '' } });
    }
  }

  function setCiteText(text: string) {
    const change = pending.get();
    if (change?.cite !== undefined) {
      pending.set({ ...change, cite: { ...change.cite, text } });
    }
  }

  function editBox() {
    const box = boxHere.get();
    if (box !== null && pending.get() === null) setBox(box);
  }

  function discard() {
    if (oldFilming.get()) return;
    if (pending.get() === null && boxHere.get() !== null) discarding.set(true);
  }

  // Back to the Link; with none, or from a pending Citation, it stays on
  // the Image.
  function cancel() {
    const change = pending.get();
    if (change === null) {
      discarding.set(false);
      return;
    }
    const shown = source.get();
    if (shown?.link === null || change.cite !== undefined) pending.set(null);
    else if (shown !== null) openNow(shown);
  }

  // The citations reload, as after a Mark: a Record pin taken back moves
  // everyone citing the record. The viewer stays on the Image.
  async function confirmDiscard() {
    const shown = source.get();
    const at = volume.get();
    if (shown === null || at === null || !discarding.get()) return;
    if (shown.citation.madeInApp) {
      await api.uncite(shown.citation.id);
      void selected.refresh();
      if (source.get() === shown) closeNow();
      return;
    }
    const resolved = await selected.discard(shown.citation.id, {
      volumeId: at.id,
      image: image.get()
    });
    // The faint Box stays until the citations say it's gone, or the old
    // one shows again in between.
    await loadCitations(at.id);
    if (source.get() !== shown) return;
    discarding.set(false);
    const links = 'links' in resolved ? resolved.links : [];
    const link = markedIn(resolved, at.id) ?? links[0];
    if (link !== undefined) source.set({ citation: shown.citation, link });
  }

  // The Mark reloads the Volume's citations, as a confirmation does, and
  // the viewer follows the new Link. The pending Box stays until they're
  // in, or the Link's old Box shows again in between.
  async function save() {
    const shown = source.get();
    const change = pending.get();
    if (shown === null || change === null) return;
    if (change.cite !== undefined) {
      await saveCitation(change, change.cite);
      return;
    }
    const { volumeId, image: at, box } = change;
    const resolved = await selected.mark(shown.citation.id, {
      volumeId,
      image: at,
      box
    });
    const link = markedIn(resolved, volumeId);
    if (source.get() !== shown) return;
    await loadCitations(volume.get()?.id ?? volumeId);
    if (source.get() !== shown) return;
    if (link === null) pending.set(null);
    else openNow({ citation: shown.citation, link });
  }

  // The new Citation shows beside the scan once the Volume's citations
  // reload, and in the person's sources if they're the Selected person.
  async function saveCitation(
    change: PendingLink,
    cite: { personId: number; text: string }
  ) {
    const { volumeId, image: at, box } = change;
    const fileId = fileIdOf(files[at - 1]);
    if (fileId === null) {
      throw new ApiError("The Image isn't listed yet; try again.");
    }
    const text = cite.text.trim();
    await api.cite(cite.personId, {
      volumeId,
      image: at,
      fileId,
      box,
      text: text === '' ? null : text
    });
    if (selected.id.get() === cite.personId) void selected.refresh();
    await loadCitations(volumeId);
    if (pending.get() === change) pending.set(null);
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
    if (shown === null || at === null || oldFilming.get()) return;
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

  async function askRescan(volumeId: string) {
    if (answered.has(volumeId)) return;
    const answer = await rescanReq.run(async (signal) => ({
      found: await api.volumeRescan(volumeId, signal)
    }));
    if (answer === null || answer === undefined) return;
    if (volume.get()?.id !== volumeId) return;
    answered.add(volumeId);
    rescan.set(answer.found);
    known.set(answer.found);
  }

  async function imageFailed() {
    const shown = volume.get();
    if (shown !== null) await askRescan(shown.id);
  }

  // The source's Link may have been made on the filming replaced, so the
  // viewer follows its Link resolved anew.
  async function switchFilming() {
    const shown = volume.get();
    const opened = source.get();
    if (shown === null || !oldFilming.get()) return;
    const urls = await api.switchFilming(shown.id);
    rescan.set(null);
    known.set(null);
    if (volume.get()?.id !== shown.id) return;
    files = urls;
    count.set(urls.length);
    image.set(clampImage(image.get(), urls.length));
    await Promise.all([loadCitations(shown.id), selected.relink()]);
    const current = source.get();
    if (current === null || current !== opened) return;
    const resolved = selected.links.get().get(current.citation.id);
    const link = resolved === undefined ? null : markedIn(resolved, shown.id);
    if (link !== null) openNow({ citation: current.citation, link });
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
    boxHere,
    boxPending,
    setBox,
    editBox,
    citeFor,
    setCiteText,
    discarding,
    discard,
    cancel,
    confirmDiscard,
    save,
    leave,
    answer,
    rescan,
    oldFilming,
    askAgain() {
      rescan.set(known.get());
    },
    imageFailed,
    switchFilming,
    keepFilming() {
      rescan.set(null);
    }
  };
}
