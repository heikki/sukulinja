// An Entry against the tree (ADR-0033): what its dates and place would do
// to its owner's Facts, as its card lists it (common/entry-offers), and
// doing the lines ticked when it's saved. Its owner is whom the Facts are
// of: a baptism's child, a burial's or a household line's one person, a
// marriage's couple's family, through its groom (a couple not one yet has
// no Facts, and becomes a family when the Entry is saved).

import type { Database } from 'bun:sqlite';

import { gedcomDate } from '@/common/dates';
import type { EntryEvent, EntryFields } from '@/common/entry-events';
import { entryOffers, entryPlace } from '@/common/entry-offers';
import type { Offer, OwnFact, Ticked } from '@/common/entry-offers';
import type { InEntry } from '@/common/operations';

import type { Facts } from '../../facts/facts';
import type { createSupport } from '../support';

// Whose Facts an Entry's are: a person's own, or a family's they're a
// spouse in (`familyId`), null for a couple not a family yet.
export interface Owner {
  personId: number;
  family: boolean;
  familyId: number | null;
}

// A person as the owner of their own Facts; null for none.
function personOwner(personId: number | undefined): Owner | null {
  return personId === undefined
    ? null
    : { personId, family: false, familyId: null };
}

// A marriage's owner: its couple's family, through its groom.
function coupleOwner(
  people: InEntry[],
  coupleOf: (a: number, b: number) => number | null
): Owner | null {
  const groom = people.find((p) => p.role === 'HUSB')?.personId;
  const bride = people.find((p) => p.role === 'WIFE')?.personId;
  if (groom === undefined || bride === undefined) return null;
  return { personId: groom, family: true, familyId: coupleOf(groom, bride) };
}

// Whom the Entry's Facts are of, of those it names; null for none.
// `coupleOf` gives the family two are a couple in.
export function ownerOf(
  event: EntryEvent | null,
  people: InEntry[],
  coupleOf: (a: number, b: number) => number | null
): Owner | null {
  if (event === 'CHR') {
    return personOwner(people.find((p) => p.role === 'CHIL')?.personId);
  }
  if (event === 'MARR') return coupleOwner(people, coupleOf);
  const [only, ...more] = people;
  return event !== null && more.length === 0
    ? personOwner(only?.personId)
    : null;
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

// The lines worked out for an Entry.
export interface Offered {
  offers: Offer[];
}

function sameLine(o: Offer, t: Ticked) {
  return o.tag === t.tag && o.action === t.action;
}

export function entryTree(
  db: Database,
  { facts, support, parishOf }: TreeDeps
) {
  const factsOf = db.prepare<OwnFact, [string, number]>(
    `SELECT id, tag, date_text AS date, place FROM facts
     WHERE scope_type = ? AND scope_id = ? ORDER BY id`
  );
  const couple = db.prepare<{ id: number }, [number, number]>(
    `SELECT id FROM families
     WHERE (husband_id = ?1 AND wife_id = ?2) OR (husband_id = ?2 AND wife_id = ?1)
     ORDER BY id LIMIT 1`
  );
  function coupleOf(a: number, b: number) {
    return couple.get(a, b)?.id ?? null;
  }

  // The owner's Facts: a couple not a family yet has none.
  function ownFacts(owner: Owner) {
    if (!owner.family) return factsOf.all('person', owner.personId);
    return owner.familyId === null ? [] : factsOf.all('family', owner.familyId);
  }
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
  function factOf(owner: Owner, offer: Offer) {
    if (offer.action === 'support') return offer.factId;
    if (offer.action === 'add') {
      const empty = { type: null, address: null, value: null };
      const added = facts.add(owner.personId, {
        tag: offer.tag,
        familyId: owner.familyId,
        ...typed(offer.now, empty)
      });
      if (added === null || 'rejected' in added) {
        throw new Error(`The ${offer.tag} couldn't be added.`);
      }
      return added.id;
    }
    if (offer.action === 'change') {
      const kept = factRow.get(offer.factId)!;
      const edited = facts.edit(
        owner.personId,
        offer.factId,
        typed(offer.now, kept)
      );
      if (edited === null || 'rejected' in edited) {
        throw new Error(`The ${offer.tag} couldn't be changed.`);
      }
      return offer.factId;
    }
    return null;
  }

  // Does one line, the Entry's Citation of its owner `cited` supporting
  // the Fact it adds, changes or agrees with.
  function doLine(owner: Owner, cited: number, offer: Offer) {
    const factId = factOf(owner, offer);
    if (factId !== null) support.set(cited, factId, true);
  }

  return {
    // What the Entry would do to the tree as it is now.
    async offered(entry: EntryShape): Promise<Offered> {
      const owner = ownerOf(entry.event, entry.people, coupleOf);
      if (owner === null) return { offers: [] };
      const place = entryPlace(entry.fields, await parishOf(entry.volumeId));
      const offers = entryOffers(
        entry.event,
        entry.fields,
        place,
        ownFacts(owner)
      );
      return { offers };
    },

    // Why the lines ticked can't be done: one the Entry doesn't offer now,
    // as the tree or the Entry changed since it was listed. Null when they
    // can.
    tickRefusal({ offers }: Offered, ticked: Ticked[]) {
      return ticked.every((t) => offers.some((o) => sameLine(o, t)))
        ? null
        : 'The tree has changed since; look at the list again.';
    },

    // Does the lines ticked, in the order listed, each with its Changes,
    // for the Entry of the Event naming the people as saved: the family
    // a marriage made is its owner now. `citationOf` gives the owner's
    // Citation of the Entry. Run inside the save's transaction.
    doTicked(
      saved: { event: EntryEvent | null; people: InEntry[] },
      { offers }: Offered,
      ticked: Ticked[],
      citationOf: (personId: number) => number
    ) {
      const owner = ownerOf(saved.event, saved.people, coupleOf);
      if (owner === null) return;
      const cited = citationOf(owner.personId);
      for (const offer of offers) {
        if (ticked.some((t) => sameLine(offer, t))) doLine(owner, cited, offer);
      }
    }
  };
}
