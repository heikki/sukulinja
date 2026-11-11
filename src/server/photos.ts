// A person's Photos: the pictures linked to them, each with everyone it's
// linked to and where the import marked them on it. A family's or an
// event's photos, and files that aren't pictures, are left out.

import type { Database } from 'bun:sqlite';

import type { Box, PhotoPerson, PhotoRow } from '@/common/types';

interface LinkRow {
  person_id: number;
  crop_top: number | null;
  crop_left: number | null;
  crop_width: number | null;
  crop_height: number | null;
}

function boxOf(r: LinkRow): Box | null {
  const { crop_top: top, crop_left: left } = r;
  const { crop_width: width, crop_height: height } = r;
  return top !== null && left !== null && width !== null && height !== null
    ? { left, top, width, height }
    : null;
}

// One per person, in the order first linked; a link with a Box wins over
// one without, as a person linked twice keeps where they were marked.
function peopleOf(links: LinkRow[]): PhotoPerson[] {
  const people = new Map<number, PhotoPerson>();
  for (const link of links) {
    const box = boxOf(link);
    const had = people.get(link.person_id);
    if (had === undefined || (had.box === null && box !== null)) {
      people.set(link.person_id, { personId: link.person_id, box });
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
  const linksOf = db.prepare<LinkRow, [number]>(
    `SELECT scope_id AS person_id, crop_top, crop_left, crop_width, crop_height
     FROM media_links
     WHERE media_id = ? AND scope_type = 'person'
     ORDER BY id`
  );

  return {
    ofPerson(personId: number): PhotoRow[] {
      return ofPerson.all(personId).map((m) => ({
        ...m,
        people: peopleOf(linksOf.all(m.id))
      }));
    }
  };
}
