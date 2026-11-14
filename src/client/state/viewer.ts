import { computed, signal } from '@lit-labs/signals';

import type { DatasetApi, InEntry } from '@/client/dataset-api';
import type { Box, Rescan, VolumeChoice, VolumeCitation } from '@/common/types';

import { confirmingSource } from './confirming';
import type { Confirming } from './confirming';
import { entryBox } from './entry-box';
import type { EntryBox } from './entry-box';
import { filmingOf } from './filming';
import { Latest } from './latest';
import { viewerOnward } from './onward';
import { pendingChange } from './pending-change';
import type { PendingChange } from './pending-change';
import type { EntryForm } from './pending-entry';
import { boxOn, clampImage, fileIdOf, imageOf, markedIn } from './places';
import type { Readable, Selected } from './selected';
import { linkedBeside, revealingOf, viewerOpening } from './source-open';
import type { ImageOpen, LinkOpen } from './source-open';
import type { Source } from './sources';

export type { PendingAt, PendingChange } from './pending-change';
export type { EntryEdit, PendingCite } from './pending-entry';
export type { ImageOpen, LinkOpen } from './source-open';

// The Volume shown.
export interface VolumeShown {
  id: string;
  label: string;
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
  // none, to no Volume until one is chosen. Sources is brought to it.
  open: (source: LinkOpen) => void;
  // A source of the panel's opened as `open` does: at its Link, or failing
  // one looking through its parish's Volumes. Without `reveal`, as Events
  // opens one, Sources isn't brought to it. False when it has nothing to
  // open there, and nothing opens.
  openSource: (source: Source, options: { reveal: boolean }) => boolean;
  // The open Sources is to be brought to: a new one on each open, so the
  // same source opened again is brought to again; null for an open with
  // `reveal: false`, and while the viewer is off its Link.
  revealing: Readable<LinkOpen | null>;
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
  // The change not saved yet: a Mark, a new Entry or the source's edited.
  pending: Readable<PendingChange | null>;
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
  // Changing the pending Entry: who can't be named in it
  // (`notNamable`), what it says (`setText`), who is named in each Role,
  // in place of whoever had it, or for a Role-less Book added
  // (`setInEntry`), all named at once (`setPeople`), and someone taken
  // out (`drop`).
  entryForm: EntryForm;
  // Starts editing the source's Entry, made in the app: its people, what
  // it says and its Box, pending, as a new one is.
  editEntry: () => void;
  // The source's Box: what it is, so what its menu offers, and its Entry.
  entry: EntryBox;
  // Deletes one of the Selected person's Citations, as _Sources_ does
  // (ADR-0021): the viewer closes if it shows it, else the Volume's
  // citations read again, as one of an Entry beside the scan goes.
  uncite: (citationId: number) => Promise<void>;
  // Puts what one of the Selected person's Citations says, as _Sources_
  // does: its Entry's, for everyone citing it. The source and the
  // Volume's citations read again, so the Entry is edited from it.
  retext: (citationId: number, text: string | null) => Promise<void>;
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

  const reveals = revealingOf(source, away);

  const volumeReq = new Latest();
  const citationsReq = new Latest();
  const onward = viewerOnward(selected, { openNow, open, close, closeNow });
  const changing = pendingChange({
    api,
    selected,
    source,
    placeable() {
      const shown = volume.get();
      if (shown === null || oldFilming.get()) return null;
      return { volumeId: shown.id, volume: shown.label, image: image.get() };
    },
    fileOf: (n) => fileIdOf(files[n - 1]),
    reload: loadCitations,
    citations,
    placing() {
      discarding.set(false);
      confirmation.forget();
    },
    openLink: openNow,
    openImage: openImageNow
  });
  const { change: pending } = changing;

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

  // Off whatever was shown: nothing pending or asked of it is kept.
  function moveOff() {
    onward.moved();
    changing.drop();
    discarding.set(false);
    confirmation.forget();
  }

  function openNow(next: LinkOpen, reveal = true) {
    opening();
    moveOff();
    const at = { ...next };
    opened.set(at);
    reveals.opened(at, reveal);
    const { link } = next;
    if (link === null) showNoVolume();
    else showVolume(link.volumeId, link.volume, imageOf(link));
  }

  function openImageNow(at: ImageOpen) {
    opening();
    moveOff();
    opened.set({ ...at });
    showVolume(at.volumeId, at.volume, at.image);
  }

  // Nothing shown, so the next source opens afresh.
  function closeNow() {
    moveOff();
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

  function openSource(from: Source, { reveal }: { reveal: boolean }) {
    const next = viewerOpening(from);
    if (next === null) return false;
    leave(() => {
      openNow(next, reveal);
    });
    return true;
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

  const cited = entryBox(api, selected, source, citations);

  function editEntry() {
    const box = boxHere.get();
    const entryId = source.get()?.citation.entryId ?? null;
    if (box === null || entryId === null || pending.get() !== null) return;
    changing.editEntry(entryId, box, cited.people.get());
  }

  function editBox() {
    const box = boxHere.get();
    if (box !== null && pending.get() === null) changing.mark(box);
  }

  function discard() {
    if (oldFilming.get()) return;
    confirmation.forget();
    if (pending.get() === null && boxHere.get() !== null) discarding.set(true);
  }

  function cancel() {
    if (pending.get() === null) discarding.set(false);
    else changing.cancel();
  }

  // The citations reload, as after a Mark: a Record pin taken back moves
  // everyone citing the record. The viewer stays on the Image.
  async function confirmDiscard() {
    const shown = source.get();
    const at = volume.get();
    if (shown === null || at === null || !discarding.get()) return;
    if (cited.deletes.get()) {
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
    const made = await changing.save();
    return made === null ? null : pick(made);
  }

  // A way out goes where it was going: a new Citation saved on the way
  // isn't opened.
  async function answer(given: LeaveAnswer) {
    if (given === 'save') await changing.save();
    else if (given === 'discard') changing.drop();
    const waiting = held;
    held = null;
    leaving.set(false);
    if (given === 'keep') waiting?.stay?.();
    else waiting?.go();
  }

  function step(by: 1 | -1) {
    const shown = source.get();
    if (!sourcesInView.get() || shown === null) return;
    const next = linkedBeside(selected.sources.get(), shown.citation.id, by);
    if (next !== null) open(next);
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

  async function reloadShown() {
    const shown = volume.get();
    if (shown !== null) await loadCitations(shown.id);
  }

  async function uncite(citationId: number) {
    await selected.uncite(citationId);
    if (source.get()?.citation.id === citationId) closeNow();
    else await reloadShown();
  }

  async function retext(citationId: number, text: string | null) {
    await selected.retext(citationId, text);
    const shown = source.get();
    const now = selected.details
      .get()
      ?.citations.find((c) => c.id === shown?.citation.id);
    if (shown !== null && now !== undefined) {
      opened.set({ ...shown, citation: now });
    }
    await reloadShown();
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
    openSource,
    revealing: reveals.revealing,
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
    setBox: changing.moveBox,
    editBox,
    newEntry: changing.newEntry,
    entryForm: changing.form,
    editEntry,
    uncite,
    retext,
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
