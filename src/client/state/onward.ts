import type { Selected } from './selected';
import type { LinkOpen } from './viewer';

// How the Scan viewer moves, for what it goes on with.
interface Moves {
  openNow: (source: LinkOpen) => void;
  open: (source: LinkOpen) => void;
  close: () => void;
  closeNow: () => void;
}

// What the Scan viewer goes on with when someone else is selected
// (ADR-0011): a citation picked in it, at once, or a Citation of theirs a
// list goes to, once their Links are in. Selecting anyone else closes it.
export function viewerOnward(selected: Selected, viewer: Moves) {
  let noted:
    | { personId: number; source: LinkOpen }
    | { personId: number; citationId: number }
    | null = null;
  // Counts the viewer's moves, so a Citation waiting on its Links is
  // dropped once the viewer has moved on.
  let moves = 0;

  // A Citation of the Selected person's opened as the panel opens it: at
  // its Link, or with none, looking through its parish's Volumes. Null
  // when there's no way in.
  function citationOpen(citationId: number): LinkOpen | null {
    const source = selected.sources
      .get()
      .flatMap((g) => g.sources)
      .find((s) => s.citation.id === citationId);
    const status = source?.status ?? null;
    if (source === undefined || status === null) return null;
    const { citation } = source;
    if (status.link !== null) return { citation, link: status.link };
    if (status.browse === null) return null;
    return { citation, link: null, unlinked: status.browse };
  }

  // What's shown stays until the person's Links are in, so going from one
  // Citation to another in the same Volume only turns the Image. With no
  // way in, it stays on, unless what it shows was someone else's.
  async function openCitation(
    personId: number,
    citationId: number,
    { newPerson }: { newPerson: boolean }
  ) {
    const at = ++moves;
    await selected.select(personId);
    if (at !== moves || selected.id.get() !== personId) return;
    const next = citationOpen(citationId);
    if (next !== null) viewer.open(next);
    else if (newPerson) viewer.close();
  }

  // A citation picked in the viewer, of someone not selected yet.
  function pick(personId: number, source: LinkOpen) {
    noted = { personId, source };
  }

  // As Viewer's `toCitation`.
  function toCitation(personId: number, citationId: number) {
    if (personId === selected.id.get()) {
      void openCitation(personId, citationId, { newPerson: false });
      return null;
    }
    noted = { personId, citationId };
    return personId;
  }

  // Called once `id` is selected.
  function selectedNow(id: number) {
    const going = noted?.personId === id ? noted : null;
    noted = null;
    if (going === null) viewer.closeNow();
    else if ('source' in going) viewer.openNow(going.source);
    else void openCitation(id, going.citationId, { newPerson: true });
  }

  // Called as the viewer moves.
  function moved() {
    moves++;
  }

  return { moved, pick, toCitation, selected: selectedNow };
}
