import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi, InEntry } from '@/client/dataset-api';
import type {
  Box,
  CitationRow,
  Link,
  Rescan,
  UnlinkedResolution,
  VolumeChoice,
  VolumeCitation
} from '@/common/types';

import { confirmingSource } from './confirming';
import type { Confirming } from './confirming';
import { entryBox } from './entry-box';
import type { EntryBox } from './entry-box';
import { filmingOf } from './filming';
import { Latest } from './latest';
import { viewerOnward } from './onward';
import { pendingEntry } from './pending-entry';
import type { EntryEdit, EntryForm, PendingCite } from './pending-entry';
import { boxOn, clampImage, fileIdOf, imageOf, markedIn } from './places';
import type { Readable, Selected } from './selected';

// A church-book source opened in the Scan viewer, on one Link of its
// reference, or with none, to look through its parish's Volumes for it:
// `unlinked` says why it has none.
export type LinkOpen =
  | { citation: CitationRow; link: Link }
  | { citation: CitationRow; link: null; unlinked: UnlinkedResolution };

// An Image of a Volume opened in the Scan viewer with no source, as an
// Image's Reminder opens it.
export interface ImageOpen {
  volumeId: string;
  volume: string;
  image: number;
}

export type { EntryEdit, PendingCite } from './pending-entry';

// The Volume shown.
export interface VolumeShown {
  id: string;
  label: string;
}

// A change not saved yet: where on an Image of a Volume the entry is.
// Without `cite`, it moves the current source's Link there. With `cite`,
// it's a new Entry with a Citation for each person in it instead: it
// belongs to the Image shown, with a source or none.
export interface PendingLink {
  volumeId: string;
  volume: string;
  image: number;
  box: Box;
  cite?: PendingCite;
}

// What leaving the source with a change pending waits on.
export type LeaveAnswer = 'save' | 'discard' | 'keep';

// What the Scan viewer shows. It belongs to the Selected person
// (ADR-0011): selecting someone else closes it. While a change is pending,
// anything moving off its Image waits until it's saved or discarded:
// opening another source, stepping, showing another Image or Volume, and
// closing.
export interface Viewer {
  // What it's open on: a source, or an Image with none; null while it's
  // closed. A new object on each open, even of the one shown.
  opened: Readable<LinkOpen | ImageOpen | null>;
  // The source it's open on; null with none.
  source: Readable<LinkOpen | null>;
  volume: Readable<VolumeShown | null>;
  image: Readable<number>;
  // The length of Astia's list of the Volume's Images; null until it
  // arrives, and if it can't.
  count: Readable<number | null>;
  // The file id of the Image shown, in Astia's list; null until the list
  // arrives.
  fileIdHere: () => string | null;
  // The Volume's citations; null until they arrive.
  citations: Readable<VolumeCitation[] | null | 'failed'>;
  // The title of the archive the Volume is in, however it was opened; null
  // until it's known, and if it can't be.
  archive: Readable<string | null>;
  // Off the Link's Image. A Link to only the Volume holds anywhere in it;
  // with no Link, nothing is away.
  away: Readable<boolean>;
  // Whether the dock's Sources list can be seen; the panel says.
  sourcesInView: Readable<boolean>;
  setSourcesInView: (inView: boolean) => void;
  // Whether the menu's item placing the source's Citation is pointed at,
  // for the panel to mark the source as it does one shown.
  placing: Readable<boolean>;
  setPlacing: (on: boolean) => void;
  // To the source's Link, even when it shows that source already; with
  // none, to no Volume until one is chosen.
  open: (source: LinkOpen) => void;
  // To an Image of a Volume, with no source: the people beside the scan
  // as usual, and nothing to edit but new Citations and Reminders.
  openImage: (at: ImageOpen) => void;
  // To Image `n` of the Volume shown.
  show: (n: number) => void;
  // To the source before or after with a Link, in the panel's order.
  step: (by: 1 | -1) => void;
  // A person picked in the viewer: their id when they aren't the Selected
  // person, for the picker to ask for them.
  pick: (row: VolumeCitation) => number | null;
  // To a Citation of the person's, as a list goes to one: once their
  // Links are in, at its Link, or with none, looking through its parish's
  // Volumes; with no way in, as it is, or closed if it showed someone
  // else's. Until then the viewer stays as it is. Their id when they aren't the Selected person, for the caller to
  // ask for them.
  toCitation: (personId: number, citationId: number) => number | null;
  // Called by the chart once `id` is selected.
  selected: (id: number) => void;
  // Marks a Match's Image, throwing ApiError if it's refused.
  confirm: (row: Pick<VolumeCitation, 'citation' | 'link'>) => Promise<void>;
  // Confirms the source's Match, as its Box's menu asks.
  confirmSource: () => Promise<void>;
  // How that's going. A refusal stays until the source, the Image or the
  // Box changes.
  confirming: Readable<Confirming | null>;
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
  // Puts a new Entry at the Box, on the Image shown, pending, with the
  // people in it so far.
  newEntry: (box: Box, people: InEntry[]) => void;
  // Changing the pending Entry: what it says (`setText`), who is named
  // in each Role, in place of whoever had it, or for a Role-less Book
  // added (`setInEntry`), all named at once (`setPeople`), and someone
  // taken out (`drop`).
  entryForm: EntryForm;
  // Starts editing the source's Entry, made in the app: its people, what
  // it says and its Box, pending, as a new one is.
  editEntry: () => void;
  // The source's Entry, as its Box's menu changes it.
  entry: EntryBox;
  // A Discard of the Link's Box on the Image shown, waiting to be saved.
  // Moving off the Image drops it.
  discarding: Readable<boolean>;
  // Asks to take back the Link's Box on the Image shown.
  discard: () => void;
  // Drops the pending change, back to the Link, or the Discard asked for.
  cancel: () => void;
  // Takes the Box back, throwing ApiError if it's refused, and goes on
  // with the Link it leaves, on the Image shown. For a Citation made in
  // the app, deletes it instead, with its whole Entry, and the viewer
  // closes.
  confirmDiscard: () => Promise<void>;
  // Saves the pending change as a Mark and follows the new Link, or makes
  // the pending Citation and opens on it, throwing ApiError if it's
  // refused. Its person's id when they aren't the Selected person, for the
  // caller to select them, as `pick` gives it.
  save: () => Promise<number | null>;
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

// `opening` is told as it opens on anything, for the Photo viewer to close.
export function openViewer(
  api: DatasetApi,
  selected: Selected,
  { opening = () => undefined }: { opening?: () => void } = {}
): Viewer {
  const opened = signal<LinkOpen | ImageOpen | null>(null);
  const source = computed(() => {
    const at = opened.get();
    return at !== null && 'citation' in at ? at : null;
  });
  const volume = signal<VolumeShown | null>(null);
  const image = signal(1);
  const count = signal<number | null>(null);
  // Astia's viewer address of each of the Volume's Images.
  let files: string[] = [];
  const citations = signal<VolumeCitation[] | null | 'failed'>(null);
  const archive = signal<string | null>(null);
  const sourcesInView = signal(false);
  const placing = signal(false);
  const pending = signal<PendingLink | null>(null);
  const discarding = signal(false);
  const confirmation = confirmingSource(source, confirm);
  const leaving = signal(false);
  const filming = filmingOf(api, () => volume.get()?.id);
  const { oldFilming } = filming;
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

  const volumeReq = new Latest();
  const citationsReq = new Latest();
  const onward = viewerOnward(selected, { openNow, open, close, closeNow });

  // What Astia says of the Volume, its Images and its archive, asked for
  // at once, so the viewer names it as it shows it. Until they come, the
  // archive named before stays: the title doesn't blink each time the
  // Volume changes.
  async function loadVolume(volumeId: string) {
    const shown = await volumeReq.run(
      async (signal) => await api.volume(volumeId, signal)
    );
    if (shown === undefined) return;
    archive.set(shown?.archive ?? null);
    if (shown === null) return;
    files = shown.images;
    count.set(files.length);
    image.set(clampImage(image.get(), files.length));
  }

  async function loadCitations(volumeId: string) {
    const rows = await citationsReq.run(
      async (signal) => await api.volumeCitations(volumeId, signal)
    );
    if (rows !== undefined) citations.set(rows ?? 'failed');
  }

  function showNow(n: number) {
    discarding.set(false);
    confirmation.forget();
    image.set(clampImage(n, count.get()));
  }

  // A Volume already shown stays on its Image unless `at` gives one.
  function showVolume(id: string, label: string, at: number | null) {
    if (volume.get()?.id === id) {
      if (at !== null) showNow(at);
      return;
    }
    filming.forget();
    discarding.set(false);
    volume.set({ id, label });
    image.set(clampImage(at ?? 1, null));
    count.set(null);
    files = [];
    citations.set(null);
    void loadVolume(id);
    void loadCitations(id);
    void filming.ask(id);
  }

  // Nothing of a Volume shown, as before the first is chosen.
  function showNoVolume() {
    filming.forget();
    volumeReq.stop();
    citationsReq.stop();
    archive.set(null);
    volume.set(null);
    image.set(1);
    count.set(null);
    citations.set(null);
  }

  function openNow(next: LinkOpen) {
    opening();
    onward.moved();
    pending.set(null);
    discarding.set(false);
    confirmation.forget();
    opened.set({ ...next });
    const { link } = next;
    if (link === null) showNoVolume();
    else showVolume(link.volumeId, link.volume, imageOf(link));
  }

  function openImageNow(at: ImageOpen) {
    opening();
    onward.moved();
    pending.set(null);
    discarding.set(false);
    confirmation.forget();
    opened.set({ ...at });
    showVolume(at.volumeId, at.volume, at.image);
  }

  // Nothing shown, so the next source opens afresh.
  function closeNow() {
    onward.moved();
    pending.set(null);
    discarding.set(false);
    confirmation.forget();
    held = null;
    leaving.set(false);
    opened.set(null);
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

  function openImage(at: ImageOpen) {
    leave(() => {
      openImageNow(at);
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

  // A Box on the Image shown, pending: for the source's entry, or with
  // `cite`, for a new Citation, which needs no source. A Volume on a
  // filming Astia replaced is read-only until switched.
  function placeBox(box: Box, cite: PendingLink['cite']) {
    const shown = volume.get();
    if (shown === null || oldFilming.get()) return;
    if (cite === undefined && source.get() === null) return;
    discarding.set(false);
    confirmation.forget();
    pending.set({
      volumeId: shown.id,
      volume: shown.label,
      image: image.get(),
      box,
      ...(cite === undefined ? {} : { cite })
    });
  }

  // A pending Citation stays one as its Box moves.
  function setBox(box: Box) {
    placeBox(box, pending.get()?.cite);
  }

  function newEntry(box: Box, people: InEntry[]) {
    placeBox(box, { people, text: '' });
  }

  const entry = pendingEntry(pending, {
    api,
    selected,
    fileOf: (n) => fileIdOf(files[n - 1]),
    reload: loadCitations
  });
  const cited = entryBox(api, selected, source, citations);

  function editEntry() {
    const box = boxHere.get();
    const entryId = source.get()?.citation.entryId ?? null;
    if (box === null || entryId === null || pending.get() !== null) return;
    placeBox(box, entry.editing(entryId, box, cited.people.get()));
  }

  function editBox() {
    const box = boxHere.get();
    if (box !== null && pending.get() === null) setBox(box);
  }

  function discard() {
    if (oldFilming.get()) return;
    confirmation.forget();
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
      await cited.deleteMade(shown.citation);
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
    if (link !== undefined) opened.set({ citation: shown.citation, link });
  }

  // A new Citation opens as picking it beside the scan would, so a wrong
  // Image is put right with Place citation here.
  async function save() {
    const made = await saveChange();
    return made === null ? null : pick(made);
  }

  // The pending change saved: a Mark, or a new Citation, given back.
  async function saveChange() {
    const change = pending.get();
    if (change?.cite?.editing !== undefined) {
      await saveEdit(change, change.cite.editing);
      return null;
    }
    if (change?.cite !== undefined) {
      return await entry.save(change, change.cite);
    }
    await saveMark();
    return null;
  }

  // The Mark reloads the Volume's citations, as a confirmation does, and
  // the viewer follows the new Link. The pending Box stays until they're
  // in, or the Link's old Box shows again in between.
  async function saveMark() {
    const shown = source.get();
    const change = pending.get();
    if (shown === null || change === null) return;
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

  // The source's Entry changed: the viewer stays on its Citation, at the
  // Box saved, or with the source's own person taken out, on the Image.
  async function saveEdit(change: PendingLink, editing: EntryEdit) {
    const shown = source.get();
    const kept = await entry.saveEdit(change, editing);
    if (shown === null || source.get() !== shown) return;
    const [{ link }, { volumeId, volume, image: at, box }] = [shown, change];
    if (kept.includes(shown.citation.id) && link?.precision === 'entry') {
      openNow({ citation: shown.citation, link: { ...link, box } });
      return;
    }
    openImageNow({ volumeId, volume, image: at });
  }

  // A way out goes where it was going: a new Citation saved on the way
  // isn't opened.
  async function answer(given: LeaveAnswer) {
    if (given === 'save') await saveChange();
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
    onward.pick(row.personId, picked);
    return row.personId;
  }

  // A confirmation moves its row, and a Page pin its neighbours', so the
  // citations reload. The viewer follows the Link in the marked Volume only
  // when the Mark was for its own reference.
  async function confirm(row: Pick<VolumeCitation, 'citation' | 'link'>) {
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

  async function imageFailed() {
    const shown = volume.get();
    if (shown !== null) await filming.ask(shown.id);
  }

  // The source's Link may have been made on the filming replaced, so the
  // viewer follows its Link resolved anew.
  async function switchFilming() {
    const shown = volume.get();
    const opened = source.get();
    if (shown === null || !oldFilming.get()) return;
    const urls = await api.switchFilming(shown.id, shown.label);
    filming.switched();
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
    opened,
    source,
    volume,
    image,
    count,
    citations,
    archive,
    away,
    sourcesInView,
    placing,
    setPlacing(on) {
      placing.set(on);
    },
    setSourcesInView(inView) {
      sourcesInView.set(inView);
    },
    fileIdHere: () => fileIdOf(files[image.get() - 1]),
    open,
    openImage,
    show,
    step,
    pick,
    toCitation: onward.toCitation,
    selected: onward.selected,
    confirm,
    confirmSource: confirmation.run,
    confirming: confirmation.status,
    close,
    pending,
    leaving,
    changeVolume,
    boxHere,
    boxPending,
    setBox,
    editBox,
    newEntry,
    entryForm: {
      setText: entry.setText,
      setInEntry: entry.setInEntry,
      setPeople: entry.setPeople,
      drop: entry.drop
    },
    editEntry,
    entry: cited,
    discarding,
    discard,
    cancel,
    confirmDiscard,
    save,
    leave,
    answer,
    rescan: filming.rescan,
    oldFilming,
    askAgain: filming.askAgain,
    imageFailed,
    switchFilming,
    keepFilming: filming.keep
  };
}
