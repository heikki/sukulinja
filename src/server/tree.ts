// A dataset's family tree as the chart draws it: every person, with their
// years and portrait, and every family, with its children. What the panel
// shows of one person is person-details.ts.

import type { Database } from 'bun:sqlite';

import type { FamilyRow, PersonRow } from '@common/types';

// The year of a date as written ("ABT 1757", "12 MAR 1820").
function yearOf(date: string | null) {
  if (date === null) return null;
  const m = /(?<year>\d{4})/u.exec(date);
  return m === null ? null : parseInt(m.groups!.year!, 10);
}

type PersonDbRow = Omit<PersonRow, 'birth_year' | 'death_year' | 'crop'> & {
  crop_top: number | null;
  crop_left: number | null;
  crop_width: number | null;
  crop_height: number | null;
};

// A crop is all four sides or none.
function cropOf(r: PersonDbRow) {
  const { crop_top: top, crop_left: left } = r;
  const { crop_width: width, crop_height: height } = r;
  return top !== null && left !== null && width !== null && height !== null
    ? { top, left, width, height }
    : null;
}

export function createTree(db: Database) {
  // Each person's first name, and their portrait: the photo marked primary,
  // else the first linked. Sorted by surname, then given name.
  const listPersons = db.prepare<PersonDbRow, []>(`
    SELECT
      p.id,
      n.given,
      n.surname,
      p.sex,
      (SELECT date_text FROM facts WHERE scope_type='person' AND scope_id=p.id AND tag='BIRT' LIMIT 1) AS birth_date,
      (SELECT date_text FROM facts WHERE scope_type='person' AND scope_id=p.id AND tag='DEAT' LIMIT 1) AS death_date,
      m.file_path AS photo_path,
      ml.crop_top,
      ml.crop_left,
      ml.crop_width,
      ml.crop_height
    FROM persons p
    LEFT JOIN names n ON n.person_id = p.id AND n.sort_order = 0
    LEFT JOIN media_links ml ON ml.id = (
      SELECT ml2.id FROM media_links ml2
      JOIN media m2 ON m2.id = ml2.media_id
      WHERE ml2.scope_type='person' AND ml2.scope_id=p.id
      ORDER BY ml2.is_primary DESC, ml2.sort_order ASC, ml2.id ASC
      LIMIT 1
    )
    LEFT JOIN media m ON m.id = ml.media_id
    ORDER BY n.surname COLLATE NOCASE, n.given COLLATE NOCASE
  `);
  const listFamilies = db.prepare<Omit<FamilyRow, 'child_ids'>, []>(
    'SELECT id, husband_id, wife_id FROM families'
  );
  const listFamilyChildren = db.prepare<
    { family_id: number; person_id: number },
    []
  >(
    'SELECT family_id, person_id FROM family_children ORDER BY family_id, sort_order'
  );

  return {
    persons() {
      return listPersons.all().map((r) => ({
        id: r.id,
        given: r.given,
        surname: r.surname,
        sex: r.sex,
        birth_year: yearOf(r.birth_date),
        death_year: yearOf(r.death_date),
        birth_date: r.birth_date,
        death_date: r.death_date,
        photo_path: r.photo_path,
        crop: cropOf(r)
      }));
    },

    // Each family with its children in the order the GEDCOM lists them.
    families() {
      const childrenByFamily = new Map<number, number[]>();
      for (const k of listFamilyChildren.all()) {
        const children = childrenByFamily.get(k.family_id) ?? [];
        children.push(k.person_id);
        childrenByFamily.set(k.family_id, children);
      }
      return listFamilies.all().map((f) => ({
        id: f.id,
        husband_id: f.husband_id,
        wife_id: f.wife_id,
        child_ids: childrenByFamily.get(f.id) ?? []
      }));
    }
  };
}
