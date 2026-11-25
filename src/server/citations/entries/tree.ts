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
import type { Years } from '@/common/types';

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
  // The parish of the Volume's archive, by its name, and the Volume's
  // years, each if known.
  volumeWhere: (
    volumeId: string
  ) => Promise<{ parish: string | null; years: Years | null }>;
}

// What the Entry would be: in the Volume, of the Event, naming the people,
// with its fields.
// `entryId` when it's an Entry being edited.
export interface EntryShape {
  volumeId: string;
  entryId?: number;
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
  { facts, support, volumeWhere }: TreeDeps
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

  // The Facts the Entry's Citations support.
  const supportedBy = db.prepare<{ factId: number }, [number]>(
    `SELECT fc.fact_id AS factId FROM fact_citations fc
     JOIN citations c ON c.id = fc.citation_id WHERE c.entry_id = ?`
  );
  // The owner's Facts, those the Entry being edited supports marked so: a
  // couple not a family yet has none.
  function ownFacts(owner: Owner, entryId?: number): OwnFact[] {
    const all = owner.family
      ? owner.familyId === null
        ? []
        : factsOf.all('family', owner.familyId)
      : factsOf.all('person', owner.personId);
    if (entryId === undefined) return all;
    const supported = new Set(supportedBy.all(entryId).map((r) => r.factId));
    return all.map((f) => ({ ...f, supported: supported.has(f.id) }));
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
      const { parish, years } = await volumeWhere(entry.volumeId);
      const place = entryPlace(entry.fields, parish);
      const offers = entryOffers(
        entry.event,
        { fields: entry.fields, place, years },
        ownFacts(owner, entry.entryId)
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
    // Citation of the Entry, `citations` those to take support from: a
    // Fact it supported, its line unticked and none ticked to change it,
    // they no longer do.
    // Run inside the save's transaction.
    doTicked(
      saved: { event: EntryEvent | null; people: InEntry[] },
      { offers }: Offered,
      ticked: Ticked[],
      cites: { citationOf: (personId: number) => number; citations: number[] }
    ) {
      const owner = ownerOf(saved.event, saved.people, coupleOf);
      if (owner === null) return;
      const cited = cites.citationOf(owner.personId);
      const done = offers.filter((o) => ticked.some((t) => sameLine(o, t)));
      for (const offer of done) doLine(owner, cited, offer);
      for (const offer of offers) {
        if (offer.action !== 'support' || offer.kept !== true) continue;
        const { factId } = offer;
        if (done.some((o) => 'factId' in o && o.factId === factId)) continue;
        for (const id of cites.citations) support.set(id, factId, false);
      }
    }
  };
}
