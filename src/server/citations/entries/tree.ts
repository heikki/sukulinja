// An Entry against the tree (ADR-0033): what its dates and place would do
// to its owner's Facts, as its card lists it (common/entry-offers), and
// doing the lines ticked when it's saved. Its owner is whom the Facts are
// of: a baptism's child, a burial's or a household line's one person. A
// marriage's is its couple's family, which ticket 04 brings; till then it
// offers nothing.

import type { Database } from 'bun:sqlite';

import { gedcomDate } from '@/common/dates';
import type { EntryEvent, EntryFields } from '@/common/entry-events';
import { entryOffers, entryPlace } from '@/common/entry-offers';
import type { Offer, OwnFact, Ticked } from '@/common/entry-offers';
import type { InEntry } from '@/common/operations';

import type { Facts } from '../../facts/facts';
import type { createSupport } from '../support';

// Whom the Entry's Facts are of, of those it names; null for none.
export function ownerOf(event: EntryEvent | null, people: InEntry[]) {
  if (event === 'CHR') {
    return people.find((p) => p.role === 'CHIL')?.personId ?? null;
  }
  if (event === 'BURI' || event === 'RESI') {
    const [only, ...more] = people;
    return only !== undefined && more.length === 0 ? only.personId : null;
  }
  return null;
}

interface TreeDeps {
  facts: Facts;
  support: ReturnType<typeof createSupport>;
  // The parish of the Volume's archive, by its name, if known.
  parishOf: (volumeId: string) => Promise<string | null>;
}

// What the Entry would be: in the Volume, of the Event, naming the people,
// with its fields.
export interface EntryShape {
  volumeId: string;
  event: EntryEvent | null;
  people: InEntry[];
  fields: EntryFields;
}

// The lines worked out for an Entry, with whose Facts they're of.
export interface Offered {
  owner: number | null;
  offers: Offer[];
}

function sameLine(o: Offer, t: Ticked) {
  return o.tag === t.tag && o.action === t.action;
}

export function entryTree(
  db: Database,
  { facts, support, parishOf }: TreeDeps
) {
  const ownFacts = db.prepare<OwnFact, [number]>(
    `SELECT id, tag, date_text AS date, place FROM facts
     WHERE scope_type = 'person' AND scope_id = ? ORDER BY id`
  );
  const factRow = db.prepare<
    {
      type: string | null;
      address: string | null;
      value: string | null;
    },
    [number]
  >('SELECT type, address, value FROM facts WHERE id = ?');

  // A Fact's fields, as the panel would type them, made to say `now`.
  function typed(
    now: { date: string | null; place: string | null },
    kept: { type: string | null; address: string | null; value: string | null }
  ) {
    return {
      date: now.date === null ? '' : gedcomDate(now.date),
      place: now.place ?? '',
      address: kept.address ?? '',
      value: kept.value ?? '',
      type: kept.type ?? ''
    };
  }

  // The Fact the line adds or changes, done, or agrees with: its id.
  // Throws if the Facts refuse, which undoes the save around it.
  function factOf(owner: number, offer: Offer) {
    if (offer.action === 'support') return offer.factId;
    if (offer.action === 'add') {
      const empty = { type: null, address: null, value: null };
      const added = facts.add(owner, {
        tag: offer.tag,
        familyId: null,
        ...typed(offer.now, empty)
      });
      if (added === null || 'rejected' in added) {
        throw new Error(`The ${offer.tag} couldn't be added.`);
      }
      return added.id;
    }
    if (offer.action === 'change') {
      const kept = factRow.get(offer.factId)!;
      const edited = facts.edit(owner, offer.factId, typed(offer.now, kept));
      if (edited === null || 'rejected' in edited) {
        throw new Error(`The ${offer.tag} couldn't be changed.`);
      }
      return offer.factId;
    }
    return null;
  }

  // Does one line, the Entry's Citation of its owner `cited` supporting
  // the Fact it adds, changes or agrees with.
  function doLine(owner: number, cited: number, offer: Offer) {
    const factId = factOf(owner, offer);
    if (factId !== null) support.set(cited, factId, true);
  }

  return {
    // What the Entry would do to the tree as it is now.
    async offered(entry: EntryShape): Promise<Offered> {
      const owner = ownerOf(entry.event, entry.people);
      if (owner === null) return { owner, offers: [] };
      const place = entryPlace(entry.fields, await parishOf(entry.volumeId));
      const offers = entryOffers(
        entry.event,
        entry.fields,
        place,
        ownFacts.all(owner)
      );
      return { owner, offers };
    },

    // Why the lines ticked can't be done: one the Entry doesn't offer now,
    // as the tree or the Entry changed since it was listed. Null when they
    // can.
    tickRefusal({ offers }: Offered, ticked: Ticked[]) {
      return ticked.every((t) => offers.some((o) => sameLine(o, t)))
        ? null
        : 'The tree has changed since; look at the list again.';
    },

    // Does the lines ticked, in the order listed, each with its Changes;
    // `citationOf` gives the owner's Citation of the Entry. Run inside the
    // save's transaction.
    doTicked(
      { owner, offers }: Offered,
      ticked: Ticked[],
      citationOf: (personId: number) => number
    ) {
      if (owner === null) return;
      const cited = citationOf(owner);
      for (const offer of offers) {
        if (ticked.some((t) => sameLine(offer, t))) doLine(owner, cited, offer);
      }
    }
  };
}
