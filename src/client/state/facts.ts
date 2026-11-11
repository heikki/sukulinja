import { signal } from '@lit-labs/signals';

import type { DatasetApi } from '@/client/dataset-api';
import type { FactFields, NewFact } from '@/common/types';

import { Latest } from './latest';
import type { Readable, Selected } from './selected';

// Adding, changing and deleting the Selected person's Facts. Each throws
// ApiError if it's refused; once saved, the person's details are read
// again, and the chart's people, whose years a birth or death gives.
export interface Facts {
  // The places the dataset's Facts name, the most named first, for the
  // form to suggest; empty until they arrive.
  places: Readable<string[]>;
  // Asks for them, as a form opens.
  loadPlaces: () => void;
  add: (fact: NewFact) => Promise<void>;
  edit: (factId: number, fields: FactFields) => Promise<void>;
  remove: (factId: number) => Promise<void>;
}

export function openFacts(
  api: DatasetApi,
  selected: Selected,
  { saved }: { saved: () => void }
): Facts {
  const places = signal<string[]>([]);
  const req = new Latest();

  async function loadPlaces() {
    const all = await req.run(async (s) => await api.places(s));
    if (all !== undefined && all !== null) places.set(all);
  }

  // The Selected person, whose Facts the panel shows.
  function person() {
    const id = selected.id.get();
    if (id === null) throw new Error('no one is selected');
    return id;
  }

  async function after(saving: Promise<unknown>) {
    await saving;
    saved();
    await selected.refresh();
  }

  return {
    places,
    loadPlaces() {
      void loadPlaces();
    },
    async add(fact) {
      await after(api.addFact(person(), fact));
    },
    async edit(factId, fields) {
      await after(api.editFact(person(), factId, fields));
    },
    async remove(factId) {
      await after(api.deleteFact(person(), factId));
    }
  };
}
