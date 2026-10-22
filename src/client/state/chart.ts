// The chart a dataset is shown as: its people and their families, who it's
// built around (Root), and selecting someone on it (ADR-0011). Selecting
// waits on a change pending in the Scan viewer, selects, and makes someone
// the chart doesn't draw Root; the element drawing the chart is told, as
// its ChartView, where to move and what to write into the URL.

import { signal } from '@lit-labs/signals';

import { ApiError } from '@client/dataset-api';
import type { DatasetApi } from '@client/dataset-api';
import type { Point } from '@client/pan-zoom';
import type { FamilyRow, PersonRow, VolumeCitation } from '@common/types';

import type { Readable, Selected } from './selected';
import type { Viewer } from './viewer';

// The dataset's people, and each one's parent Family and spouse Families.
export interface People {
  persons: Map<number, PersonRow>;
  parentFamByPerson: Map<number, FamilyRow>;
  spouseFamsByPerson: Map<number, FamilyRow[]>;
}

// Root and the Selected person as the URL gives them; `panned` when it
// says where the chart is panned to, too.
export interface UrlView {
  rootId: number | null;
  selectedId: number | null;
  panned: boolean;
}

// What the element drawing the chart does as the chart moves.
export interface ChartView {
  // Whether the chart draws the person now.
  draws: (id: number) => boolean;
  // Shows their card whole and clear of the dock, which opens: `at`, the
  // card clicked, else whichever needs the least travel.
  show: (id: number, at: Point[] | null) => void;
  // The chart is about to be built around someone else, the new Root
  // pinned at `pin` on screen, or the canvas centre for null. `open` opens
  // the dock.
  rerooting: (pin: Point | null, open: boolean) => void;
  // Writes Root and the Selected person into the URL: a new Root pushes
  // an entry, anything else replaces it (ADR-0011).
  writeUrl: (push: boolean) => void;
}

// With no chart drawn, no one is, and nothing moves.
const UNDRAWN: ChartView = {
  draws: () => false,
  show: () => undefined,
  rerooting: () => undefined,
  writeUrl: () => undefined
};

// Whom the chart starts from when the URL names no one the dataset has.
const DEFAULT_ROOT_ID = 1;

export interface Chart {
  // Empty until they load.
  people: Readable<People>;
  loading: Readable<boolean>;
  // Why the people couldn't load, in the app's words.
  error: Readable<string | null>;
  root: Readable<number | null>;
  // The element drawing the chart; the detach it returns forgets it.
  attach: (view: ChartView) => () => void;
  // Loads the people, then starts from Root and the Selected person in
  // the URL, which `read` gives once they're in.
  load: (read: () => UrlView) => Promise<void>;
  // The one way to select someone (ADR-0012), for the dock's details. Once
  // a change pending in the Scan viewer is saved or discarded, their card
  // is shown, or, if the chart doesn't draw them, it's built around them.
  // `at` is the card clicked, if one was.
  select: (id: number, at?: Point[] | null) => void;
  // Builds the chart around them, pinned at `pin` on screen, and selects
  // them.
  makeRoot: (id: number, pin?: Point | null) => void;
  // A person picked in the Scan viewer, which goes on with their citation.
  pick: (row: VolumeCitation) => void;
  // Back or Forward: once the Scan viewer's change is dealt with, Root and
  // the Selected person `read` gives; `stay` runs if editing goes on.
  follow: (read: () => UrlView, stay: () => void) => void;
}

// Each person's parent Family, and their spouse Families in the order
// given.
export function familiesByPerson(families: FamilyRow[]) {
  const parentFamByPerson = new Map<number, FamilyRow>();
  const spouseFamsByPerson = new Map<number, FamilyRow[]>();
  function addSpouse(personId: number | null, fam: FamilyRow) {
    if (personId === null) return;
    const fams = spouseFamsByPerson.get(personId) ?? [];
    spouseFamsByPerson.set(personId, [...fams, fam]);
  }
  for (const fam of families) {
    for (const childId of fam.child_ids) parentFamByPerson.set(childId, fam);
    addSpouse(fam.husband_id, fam);
    addSpouse(fam.wife_id, fam);
  }
  return { parentFamByPerson, spouseFamsByPerson };
}

export function openChart(
  api: DatasetApi,
  selected: Selected,
  viewer: Viewer
): Chart {
  const people = signal<People>({
    persons: new Map(),
    ...familiesByPerson([])
  });
  const loading = signal(true);
  const error = signal<string | null>(null);
  const root = signal<number | null>(null);
  let view = UNDRAWN;

  function known(id: number | null) {
    return id !== null && people.get().persons.has(id);
  }

  // Selected, as the dock and the viewer see it.
  function choose(id: number) {
    if (id === selected.id.get()) return;
    void selected.select(id);
    viewer.selected(id);
  }

  function selectHere(id: number, at: Point[] | null) {
    choose(id);
    view.writeUrl(false);
    view.show(id, at);
  }

  function rerootNow(id: number, pin: Point | null) {
    if (id === root.get()) {
      selectHere(id, null);
      return;
    }
    view.rerooting(pin, true);
    root.set(id);
    choose(id);
    view.writeUrl(true);
  }

  function select(id: number, at: Point[] | null = null) {
    function go() {
      if (view.draws(id)) selectHere(id, at);
      else rerootNow(id, null);
    }
    if (id === selected.id.get()) go();
    else viewer.leave(go);
  }

  // Root from the URL, else the default, or the first person there is.
  function startingRoot(id: number | null) {
    if (known(id)) return id;
    if (known(DEFAULT_ROOT_ID)) return DEFAULT_ROOT_ID;
    const first = people.get().persons.keys().next();
    return first.done === true ? null : first.value;
  }

  async function load(read: () => UrlView) {
    try {
      const [persons, families] = await Promise.all([
        api.persons(),
        api.families()
      ]);
      people.set({
        persons: new Map(persons.map((p) => [p.id, p])),
        ...familiesByPerson(families)
      });
      const at = read();
      const id = startingRoot(at.rootId);
      root.set(id);
      if (id === null) return;
      if (id === at.rootId) {
        choose(known(at.selectedId) ? at.selectedId! : id);
      } else {
        choose(id);
        view.writeUrl(false);
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      error.set(err.message);
    } finally {
      loading.set(false);
    }
  }

  return {
    people,
    loading,
    error,
    root,
    attach(next) {
      view = next;
      return () => {
        if (view === next) view = UNDRAWN;
      };
    },
    load,
    select,
    makeRoot(id, pin = null) {
      viewer.leave(() => {
        rerootNow(id, pin);
      });
    },
    pick(row) {
      viewer.leave(() => {
        const id = viewer.pick(row);
        if (id !== null) select(id);
      });
    },
    follow(read, stay) {
      viewer.leave(() => {
        const at = read();
        const id = at.rootId;
        if (id === null || !known(id)) return;
        choose(known(at.selectedId) ? at.selectedId! : id);
        if (id === root.get()) return;
        // With a pan of its own, the chart lands where that puts it.
        if (!at.panned) view.rerooting(null, false);
        root.set(id);
      }, stay);
    }
  };
}
