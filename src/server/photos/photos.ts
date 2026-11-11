// A dataset's Photos, each with everyone it's linked to and where they are
// on it, the import's crops and the app's Tags (ADR-0017): a person's, or
// every one. Files that aren't pictures are left out, and so are a
// family's or an event's links.

import type { Database } from 'bun:sqlite';

import type { Box, PhotoPerson, PhotoRow } from '@/common/types';

interface LinkRow {
  media_id: number;
  person_id: number;
  crop_top: number | null;
  crop_left: number | null;
  crop_width: number | null;
  crop_height: number | null;
  added_in_app: number;
}

function boxOf(r: LinkRow): Box | null {
  const { crop_top: top, crop_left: left } = r;
  const { crop_width: width, crop_height: height } = r;
  return top !== null && left !== null && width !== null && height !== null
    ? { left, top, width, height }
    : null;
}

// One per person, in the order first linked; their Tag wins, as it stands
// in for the import's Box, else a link with a Box wins over one without,
// as a person linked twice keeps where they were marked.
function peopleOf(links: LinkRow[]): PhotoPerson[] {
  const people = new Map<number, PhotoPerson>();
  for (const link of links) {
    const box = boxOf(link);
    const had = people.get(link.person_id);
    const tag = link.added_in_app === 1;
    const better = tag || (had?.box === null && box !== null);
    if (had === undefined || (better && !had.tagged)) {
      people.set(link.person_id, {
        personId: link.person_id,
        box,
        tagged: tag
      });
    }
  }
  return [...people.values()];
}

export function createPhotos(db: Database) {
  const ofPerson = db.prepare<{ id: number; path: string }, [number]>(
    `SELECT m.id, m.file_path AS path
     FROM media_links ml JOIN media m ON m.id = ml.media_id
     WHERE ml.scope_type = 'person' AND ml.scope_id = ?
       AND m.format LIKE 'image/%'
     GROUP BY m.id
     ORDER BY MIN(ml.sort_order), MIN(ml.id)`
  );
  const ofId = db.prepare<{ id: number; path: string }, [number]>(
    `SELECT id, file_path AS path FROM media
     WHERE id = ? AND format LIKE 'image/%'`
  );
  const linksOf = db.prepare<LinkRow, [number]>(
    `SELECT media_id, scope_id AS person_id, crop_top, crop_left,
       crop_width, crop_height, added_in_app
     FROM media_links
     WHERE media_id = ? AND scope_type = 'person'
     ORDER BY id`
  );
  // Every picture as the import listed them, and every person's link.
  const allMedia = db.prepare<{ id: number; path: string }, []>(
    `SELECT id, file_path AS path FROM media
     WHERE format LIKE 'image/%'
     ORDER BY id`
  );
  const allLinks = db.prepare<LinkRow, []>(
    `SELECT media_id, scope_id AS person_id, crop_top, crop_left,
       crop_width, crop_height, added_in_app
     FROM media_links
     WHERE scope_type = 'person'
     ORDER BY id`
  );

  function withPeople(m: { id: number; path: string }): PhotoRow {
    return { ...m, people: peopleOf(linksOf.all(m.id)) };
  }

  return {
    ofPerson(personId: number): PhotoRow[] {
      return ofPerson.all(personId).map(withPeople);
    },

    // Every Photo: those no one is linked to or tagged in first, then the
    // rest, each as the import listed them.
    all(): PhotoRow[] {
      const links = Map.groupBy(allLinks.all(), (l) => l.media_id);
      const photos = allMedia
        .all()
        .map((m) => ({ ...m, people: peopleOf(links.get(m.id) ?? []) }));
      return [
        ...photos.filter((p) => p.people.length === 0),
        ...photos.filter((p) => p.people.length > 0)
      ];
    },

    // A Photo by its id; null when there's none, or it isn't a picture.
    photo(id: number): PhotoRow | null {
      const m = ofId.get(id);
      return m === null ? null : withPeople(m);
    }
  };
}

export type Photos = ReturnType<typeof createPhotos>;
