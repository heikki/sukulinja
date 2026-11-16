import { volumeTitle } from '@/client/link-labels';
import { imageLabel } from '@/client/on';
import type { Viewer } from '@/client/state';
import { referenceName } from '@/common/books';

import type { MenuItem } from '../context-menu';

// What the menu offers for the current source's Link. On its own entry
// Box (`onBox`), only that Box: a Vision match's to confirm, edit or
// discard, a Mark's to edit or discard, a Citation made in the app's to
// edit or delete, and once it's pending, the change to discard. Elsewhere,
// only over the full Image (`canBox`): a pending Box placing the source's
// Citation here, named under it as the lists name it, unless its Box is on
// the Image already, and with nothing pending, one for a new Citation of
// an entry for someone; then, with nothing pending, a Reminder, once Astia
// lists the Image; then, where Vision Match can be asked (`locate`) and
// there are estimates on the Image, a search for them all (ADR-0029); then
// Change Volume…, which only shows another Volume.
// A Box's menu offers a Reminder too. An Entry made in the app is edited
// in the card it was made in, people, words and Box at once (ADR-0026),
// and deleting it deletes everyone's Citation of it. Opened on an Image with no source,
// the same but for what's the source's: a new Citation and a Reminder, and
// a pending new Citation's Box to discard.
export function linkItems(
  viewer: Viewer,
  where: { onBox: boolean; canBox: boolean },
  open: {
    chooseVolume: () => void;
    placeBox: () => void;
    cite: () => void;
    remind: () => void;
    // The model Vision Match asks, by its label, and asking it for the
    // source, or for every estimate on the Image.
    locate?: VisionFind;
    // Taking the Volume's page numbers away, where they're shown.
    clearPages?: () => void;
  }
) {
  const remind: MenuItem[] =
    viewer.pending.get() === null && viewer.fileIdHere() !== null
      ? [{ label: 'Add reminder…', run: open.remind }]
      : [];
  if (where.onBox) return [...boxItems(viewer), ...remind];
  const hasSource = viewer.source.get() !== null;
  const items: MenuItem[] = [];
  if (where.canBox) {
    if (hasSource && viewer.boxHere.get() === null) {
      items.push({
        label: 'Place entry',
        detail: sourceName(viewer) ?? undefined,
        hover: viewer.setPlacing,
        run: open.placeBox
      });
    }
    if (viewer.pending.get() === null) {
      items.push({ label: 'New entry', run: open.cite });
    }
  }
  items.push(
    ...remind,
    ...visionItems(viewer, open.locate),
    ...pageItems(viewer, open.clearPages)
  );
  if (hasSource) {
    items.push({ label: 'Change Volume…', run: open.chooseVolume });
  }
  return items;
}

// Taking the Volume's page numbers away (ADR-0032), where any are read or
// set and they're shown.
function pageItems(viewer: Viewer, clearPages: (() => void) | undefined) {
  if (clearPages === undefined || !viewer.pages.numbered.get()) return [];
  return [
    { label: 'Clear page numbers', detail: 'This Volume', run: clearPages }
  ];
}

// Vision Match as the menu offers it, with the model's label: on the
// Image, or in the whole Volume; and the Volume's page survey alone.
export interface VisionFind {
  model: string;
  run: () => void;
  runVolume: () => void;
  survey: () => void;
}

function peopleWords(n: number) {
  return n === 1 ? '1 person' : `${n} people`;
}

// Locating every estimate on the Image with Vision Match, and every one in
// the Volume (ADR-0032), while none is being looked for.
function visionItems(viewer: Viewer, find: VisionFind | undefined): MenuItem[] {
  if (find === undefined || viewer.pending.get() !== null) return [];
  const batch = viewer.visionBatch.get();
  if (batch !== null && 'searching' in batch) return [];
  const items: MenuItem[] = [];
  const here = viewer.estimatesHere.get().length;
  if (here > 0) {
    items.push({
      label: 'Locate estimates on this Image',
      detail: `${peopleWords(here)} · Vision Match · ${find.model}`,
      run: find.run
    });
  }
  const inVolume = viewer.estimatesInVolume
    .get()
    .reduce((sum, on) => sum + on.rows.length, 0);
  if (inVolume > 0) {
    items.push({
      label: 'Locate estimates in this Volume',
      detail: `${peopleWords(inVolume)} · ${viewer.pages.numbered.get() ? 'from its page numbers' : 'page survey first'} · ${find.model}`,
      run: find.runVolume
    });
  }
  items.push({
    label: 'Survey page numbers',
    detail: `This Volume · ${find.model}`,
    run: find.survey
  });
  return items;
}

// The source's Citation by its reference, or one made in the app by the
// Image it's on.
function sourceName(viewer: Viewer) {
  const source = viewer.source.get();
  if (source === null) return null;
  const { citation, link } = source;
  const name = referenceName(citation);
  if (name !== null || link === null) return name;
  if (link.precision === 'volume') return volumeTitle(link.volume);
  return imageLabel(link.volume, link.image);
}

function boxItems(viewer: Viewer): MenuItem[] {
  if (viewer.boxPending.get()) {
    return [{ label: 'Discard changes', run: viewer.cancel }];
  }
  switch (viewer.entry.kind.get()) {
    case null:
      return [];
    case 'citation':
      return [
        { label: 'Edit', run: viewer.editBox },
        { label: 'Delete', run: viewer.discard }
      ];
    case 'entry': {
      const others = viewer.entry.people.get().length > 1;
      return [
        { label: 'Edit', run: viewer.editEntry },
        { label: others ? 'Delete entry' : 'Delete', run: viewer.discard }
      ];
    }
    case 'match':
      return [
        ...(viewer.oldFilming.get() ? [] : [confirmItem(viewer)]),
        { label: 'Edit', run: viewer.editBox },
        { label: 'Discard', run: viewer.discard }
      ];
    case 'mark':
      return [
        { label: 'Edit', run: viewer.editBox },
        { label: 'Discard', run: viewer.discard }
      ];
  }
}

function confirmItem(viewer: Viewer): MenuItem {
  return {
    label: 'Confirm',
    run: () => {
      void viewer.confirmSource();
    }
  };
}
