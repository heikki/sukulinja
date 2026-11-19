// The church books a person should be in: their Expected entries, each
// with the Volumes of the install's parishes it fits. What the Church
// books view offers first for the Selected person, and where a search
// for an Entry the tree lacks would look.

import type {
  BookSuggestion,
  CitationRow,
  ExpectedEntry,
  FactRow
} from '@/common/types';

import type { Astia } from '../astia/astia';
import type { Parishes } from '../astia/parishes';
import { expectedEntries } from './expected';
import { archivesFor, fitting } from './fits';
import type { WhereToLook } from './fits';

export { expectedEntries } from './expected';

// What of a person the books are found by: their Facts, and the parishes
// their sources cite.
export interface PersonLife {
  facts: FactRow[];
  citations: Array<Pick<CitationRow, 'cited'>>;
}

// Each part of a place ("Laukola, Haukivuori, Suomi") as a parish might be
// spelled, the whole place first.
function spellingsOf(place: string) {
  return [place, ...place.split(',').map((p) => p.trim())];
}

export function openPersonBooks({
  astia,
  parishes
}: {
  astia: Astia;
  parishes: Parishes;
}) {
  // The archives the places name, once each, in their order.
  function archivesOfPlaces(places: string[]) {
    const found = places
      .flatMap(spellingsOf)
      .map((s) => parishes.archiveOf(s))
      .filter((a) => a !== null);
    return [...new Set(found)];
  }

  // The person's parishes, most named first: by their Facts' places and
  // their sources' parishes.
  function personArchives({ facts, citations }: PersonLife) {
    return parishes.ranked([
      ...facts.flatMap((f) => (f.place === null ? [] : spellingsOf(f.place))),
      ...citations.map((c) => c.cited?.parish ?? null)
    ]);
  }

  async function suggest(
    expected: ExpectedEntry,
    where: WhereToLook
  ): Promise<BookSuggestion> {
    const looked = await Promise.all(
      archivesFor(expected, where).map(async (archive) => {
        const [title, volumes] = await Promise.all([
          astia.archiveTitle(archive.archiveId),
          astia.archiveVolumes(archive.archiveId)
        ]);
        const named = { ...archive, title: title ?? archive.archiveId };
        return { named, volumes: fitting(expected, volumes, named) };
      })
    );
    return {
      expected,
      parishes: looked.map(({ named }) => ({
        archiveId: named.archiveId,
        title: named.title
      })),
      volumes: looked.flatMap((l) => l.volumes)
    };
  }

  return {
    // The person's Expected entries in the order of their life, each with
    // the Volumes it fits. Throws AstiaError when Astia can't say.
    async booksFor(life: PersonLife): Promise<BookSuggestion[]> {
      const others = personArchives(life);
      return await Promise.all(
        expectedEntries(life.facts).map(
          async (expected) =>
            await suggest(expected, {
              near: archivesOfPlaces(expected.places),
              others
            })
        )
      );
    }
  };
}

export type PersonBooks = ReturnType<typeof openPersonBooks>;
