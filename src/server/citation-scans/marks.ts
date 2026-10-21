// A dataset's Marks and Vision matches, written into its citations
// (ADR-0013), and its Rejections. A Mark is of a record: every citation of
// the record holds its Link, and a reference with no Record number is
// marked by its URL (record.ts, markKey). A hand Mark on an Image makes the
// citation cite it: `page` becomes the Image's address in Astia, and the
// page the import gave moves to `imported_page`; clearing the Mark puts it
// back. A Vision match nobody has checked keeps the imported page.
//
// The app and the vision pass write here from two processes; each change
// is one transaction, read and written under SQLite's write lock.

import type { Database } from 'bun:sqlite';

import type { Box, Provenance } from '@common/types';

import { viewerUrl } from './astia';
import { markedRefOf, markKey } from './record';

// Where a Mark or Vision match says a record is: on an Image of a Volume,
// with the entry's Box in pixels of the full-size Image, or only in the
// Volume. `volume` is the Volume's label. The Image's file id tells the
// filming it was made on.
export interface CitationLink {
  volumeId: string;
  volume: string;
  image?: number;
  fileId?: string;
  box?: Box;
  by: Provenance;
}

// A Vision match taken back by hand: the reference isn't on that Image, of
// the filming its file id is of.
export interface Rejection {
  volumeId: string;
  image: number;
  fileId?: string;
}

// A citation's Link, with the reference it's in.
export interface MarkedCitation {
  url: string;
  recordId: number | null;
  link: CitationLink;
}

interface LinkRow {
  id: number;
  link_volume_id: string;
  link_volume: string | null;
  link_image: number | null;
  link_file_id: string | null;
  link_box_left: number | null;
  link_box_top: number | null;
  link_box_width: number | null;
  link_box_height: number | null;
  link_by: Provenance;
}

const LINK_COLUMNS = `id, link_volume_id, link_volume, link_image,
  link_file_id, link_box_left, link_box_top, link_box_width,
  link_box_height, link_by`;

function linkOfRow(row: LinkRow): CitationLink {
  const link: CitationLink = {
    volumeId: row.link_volume_id,
    volume: row.link_volume ?? row.link_volume_id,
    by: row.link_by
  };
  if (row.link_image !== null) link.image = row.link_image;
  if (row.link_file_id !== null) link.fileId = row.link_file_id;
  if (row.link_box_left !== null) {
    link.box = {
      left: row.link_box_left,
      top: row.link_box_top!,
      width: row.link_box_width!,
      height: row.link_box_height!
    };
  }
  return link;
}

// The address a citation of the link cites: the Image's in Astia, for a
// hand Mark on one; otherwise it keeps the page imported.
function citedAddress(link: CitationLink | null) {
  if (link?.by !== 'hand' || link.fileId === undefined) return null;
  return viewerUrl(link.volumeId, link.fileId);
}

function boxColumns(box: Box | undefined) {
  return box === undefined
    ? { $left: null, $top: null, $width: null, $height: null }
    : {
        $left: box.left,
        $top: box.top,
        $width: box.width,
        $height: box.height
      };
}

// The link's columns, all empty for none.
function columnsOf(link: CitationLink | null) {
  if (link === null) {
    return {
      $volumeId: null,
      $volume: null,
      $image: null,
      $fileId: null,
      $by: null,
      ...boxColumns(undefined)
    };
  }
  return {
    $volumeId: link.volumeId,
    $volume: link.volume,
    $image: link.image ?? null,
    $fileId: link.fileId ?? null,
    $by: link.by,
    ...boxColumns(link.box)
  };
}

export function openMarks(db: Database) {
  // Each church-book citation's reference, by the page it was imported
  // with, which a Mark never changes: read once.
  let index: {
    byKey: Map<string, number[]>;
    byId: Map<number, { url: string; recordId: number | null }>;
    urls: Set<string>;
  } | null = null;

  function indexed() {
    if (index !== null) return index;
    const rows = db
      .query<{ id: number; page: string }, []>(
        `SELECT id, COALESCE(imported_page, page) AS page FROM citations
         WHERE COALESCE(imported_page, page) LIKE 'http%' ORDER BY id`
      )
      .all();
    const byKey = new Map<string, number[]>();
    const byId = new Map<number, { url: string; recordId: number | null }>();
    for (const row of rows) {
      const ref = markedRefOf(row.page);
      if (ref === null) continue;
      byId.set(row.id, ref);
      const key = markKey(ref);
      byKey.set(key, [...(byKey.get(key) ?? []), row.id]);
    }
    index = {
      byKey,
      byId,
      urls: new Set([...byId.values()].map((r) => r.url))
    };
    return index;
  }

  function idsOf(key: string) {
    return JSON.stringify(indexed().byKey.get(key) ?? []);
  }

  const linkQuery = db.prepare<LinkRow, [string]>(
    `SELECT ${LINK_COLUMNS} FROM citations
     WHERE id IN (SELECT value FROM json_each(?))
       AND link_volume_id IS NOT NULL
     ORDER BY id LIMIT 1`
  );
  const linkedQuery = db.prepare<LinkRow, []>(
    `SELECT ${LINK_COLUMNS} FROM citations
     WHERE link_volume_id IS NOT NULL ORDER BY id`
  );
  // The right-hand sides read the row as it was, so the page imported is
  // taken from wherever it is now.
  const writeLink = db.prepare(
    `UPDATE citations SET
       page = COALESCE($address, imported_page, page),
       imported_page = CASE WHEN $address IS NULL THEN NULL
         ELSE COALESCE(imported_page, page) END,
       link_volume_id = $volumeId, link_volume = $volume,
       link_image = $image, link_file_id = $fileId,
       link_box_left = $left, link_box_top = $top,
       link_box_width = $width, link_box_height = $height,
       link_by = $by
     WHERE id IN (SELECT value FROM json_each($ids))`
  );
  const rejectionsQuery = db.prepare<
    { volume_id: string; image: number; file_id: string | null },
    [string]
  >(
    `SELECT volume_id, image, file_id FROM rejections
     WHERE reference_url = ? ORDER BY id`
  );
  const everyRejection = db.prepare<
    {
      reference_url: string;
      volume_id: string;
      image: number;
      file_id: string | null;
    },
    []
  >(
    'SELECT reference_url, volume_id, image, file_id FROM rejections ORDER BY id'
  );
  const dropRejection = db.prepare(
    'DELETE FROM rejections WHERE reference_url = ? AND volume_id = ? AND image = ?'
  );
  const addRejection = db.prepare(
    `INSERT INTO rejections (reference_url, volume_id, image, file_id)
     VALUES (?, ?, ?, ?)`
  );

  // Changes made here; another process's show in SQLite's data_version.
  let writes = 0;

  function linkOf(key: string) {
    const row = linkQuery.get(idsOf(key));
    return row === null ? null : linkOfRow(row);
  }

  function write(key: string, link: CitationLink | null) {
    writeLink.run({
      $address: citedAddress(link),
      ...columnsOf(link),
      $ids: idsOf(key)
    });
    writes += 1;
  }

  function rejectionsOf(url: string): Rejection[] {
    return rejectionsQuery.all(url).map((r) => ({
      volumeId: r.volume_id,
      image: r.image,
      ...(r.file_id === null ? {} : { fileId: r.file_id })
    }));
  }

  return {
    // The Link the citations of the key hold, if any.
    linkOf,

    // Writes the Link into every citation of the key, or clears it.
    write,

    // Whether a citation is of the key.
    cites(key: string) {
      return indexed().byKey.has(key);
    },

    // Whether a citation's reference is at the URL.
    citesUrl(url: string) {
      return indexed().urls.has(url);
    },

    // Runs `change` as one transaction, under the write lock.
    change<T>(change: () => T) {
      return db.transaction(change).immediate();
    },

    // Every citation with a Link, in stored order.
    linked(): MarkedCitation[] {
      const { byId } = indexed();
      return linkedQuery.all().flatMap((row) => {
        const ref = byId.get(row.id);
        return ref === undefined ? [] : [{ ...ref, link: linkOfRow(row) }];
      });
    },

    rejectionsOf,

    // A Vision match taken back at the Image, replacing one there before.
    reject(url: string, rejection: Rejection) {
      dropRejection.run(url, rejection.volumeId, rejection.image);
      addRejection.run(
        url,
        rejection.volumeId,
        rejection.image,
        rejection.fileId ?? null
      );
      writes += 1;
    },

    // Every Rejection, by the reference's URL.
    rejections() {
      const out: Record<string, Rejection[]> = {};
      for (const r of everyRejection.all()) {
        out[r.reference_url] = [
          ...(out[r.reference_url] ?? []),
          {
            volumeId: r.volume_id,
            image: r.image,
            ...(r.file_id === null ? {} : { fileId: r.file_id })
          }
        ];
      }
      return out;
    },

    // Changes whenever the Marks do, from this process or another.
    stamp() {
      const version = db
        .query<{ data_version: number }, []>('PRAGMA data_version')
        .get()!.data_version;
      return `${version}.${writes}`;
    }
  };
}

export type Marks = ReturnType<typeof openMarks>;
