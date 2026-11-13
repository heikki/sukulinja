import type { Signal } from '@lit-labs/signals';

import type { InEntry } from '@/client/dataset-api';

import type { PendingCite, PendingLink } from './viewer';

// Changing the pending new Entry (ADR-0026), if there's one: what it says,
// and who is in it.
export function pendingEntry(pending: Signal.State<PendingLink | null>) {
  function change(to: (cite: PendingCite) => Partial<PendingCite>) {
    const link = pending.get();
    if (link?.cite !== undefined) {
      pending.set({ ...link, cite: { ...link.cite, ...to(link.cite) } });
    }
  }

  // What it says, as typed.
  function setText(text: string) {
    change(() => ({ text }));
  }

  // Names the person in the Role, in place of whoever had it; with no
  // Role, adds them.
  function setInEntry(person: InEntry) {
    change(({ people }) => ({
      people: [
        ...people.filter(
          (p) =>
            p.personId !== person.personId &&
            (person.role === null || p.role !== person.role)
        ),
        person
      ]
    }));
  }

  // Takes the person out of it.
  function drop(personId: number) {
    change(({ people }) => ({
      people: people.filter((p) => p.personId !== personId)
    }));
  }

  return { setText, setInEntry, drop };
}
