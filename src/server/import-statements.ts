// The statements an import writes a dataset's database with.

import type { Database } from 'bun:sqlite';

export function importStatements(db: Database) {
  return {
    insertPerson: db.prepare(
      'INSERT INTO persons (xref, uid, sex, change_date, change_time) VALUES (?, ?, ?, ?, ?)'
    ),
    insertFamily: db.prepare(
      'INSERT INTO families (xref, uid, change_date, change_time) VALUES (?, ?, ?, ?)'
    ),
    updateFamily: db.prepare(
      'UPDATE families SET husband_id = ?, wife_id = ? WHERE id = ?'
    ),
    insertName: db.prepare(
      'INSERT INTO names (person_id, full_text, given, surname, suffix, name_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    insertNamePiece: db.prepare(
      'INSERT INTO name_pieces (name_id, tag, value, sort_order) VALUES (?, ?, ?, ?)'
    ),
    insertFact: db.prepare(
      'INSERT INTO facts (scope_type, scope_id, tag, type, date_text, place, latitude, longitude, address, age, cause, agency, value, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    insertAddress: db.prepare(
      'INSERT INTO addresses (owner_type, owner_id, text, line1, line2, line3, city, state, postal_code, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    insertAssociation: db.prepare(
      'INSERT INTO associations (person_id, associate_id, relation, sort_order) VALUES (?, ?, ?, ?)'
    ),
    insertFamilyChild: db.prepare(
      'INSERT OR IGNORE INTO family_children (family_id, person_id, sort_order) VALUES (?, ?, ?)'
    ),
    insertRepository: db.prepare(
      'INSERT INTO repositories (xref, name, phone, change_date, change_time) VALUES (?, ?, ?, ?, ?)'
    ),
    insertSource: db.prepare(
      'INSERT INTO sources (xref, title, author, publisher, text, data_events, change_date, change_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    insertSourceRepository: db.prepare(
      'INSERT INTO source_repositories (source_id, repository_id, sort_order) VALUES (?, ?, ?)'
    ),
    insertSubmitter: db.prepare(
      'INSERT INTO submitters (xref, name, phone, email, website, change_date, change_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    insertCitation: db.prepare(
      `INSERT INTO citations (scope_type, scope_id, source_id, page, event,
         role, quality, data_date, text, sort_order, imported_page,
         link_volume_id, link_volume, link_image, link_file_id, link_box_left,
         link_box_top, link_box_width, link_box_height, link_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertSharedNote: db.prepare(
      'INSERT INTO shared_notes (xref, text, change_date, change_time) VALUES (?, ?, ?, ?)'
    ),
    insertNote: db.prepare(
      'INSERT INTO notes (owner_type, owner_id, text, shared_note_id, sort_order) VALUES (?, ?, ?, ?, ?)'
    ),
    insertMeta: db.prepare(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)'
    ),
    getMediaByPath: db.prepare('SELECT id FROM media WHERE file_path = ?'),
    insertMedia: db.prepare(
      'INSERT INTO media (file_path, format, original_path) VALUES (?, ?, ?) RETURNING id'
    ),
    insertMediaLink: db.prepare(
      'INSERT INTO media_links (media_id, scope_type, scope_id, object_order, title, crop_top, crop_left, crop_width, crop_height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
  };
}

export type ImportStatements = ReturnType<typeof importStatements>;
