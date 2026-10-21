// A Mark or Vision match in GEDCOM 7 (ADR-0013), written by the export and
// read back by the import. A link to an Image is an OBJE under the
// citation, pointing at an OBJE record per Image whose FILE is the Image's
// JPEG in Astia, titled with its Volume and Image number; the Box is the
// link's CROP. `imported_page` is a NOTE, and so is a Vision match nobody
// has checked, and a link with no file to point at: only a Volume, or an
// Image whose file id wasn't known.

import type { CitationRow } from './export-rows';
import { line, pointer } from './gedcom-writer';
import type { OutLine } from './gedcom-writer';

const ASTIA_FILE =
  /^https:\/\/astia\.narc\.fi\/uusiastia\/ws\/getFile\.php\?fileId=(?<fileId>[^&]+)&aineistoId=(?<volumeId>[^&]+)$/u;
const IMAGE_TITLE = /^(?<volume>.*), Image (?<image>\d+)$/su;
const IMPORTED_PAGE = 'Imported page: ';
export const UNCHECKED = 'Found by the vision model, not checked by hand';
const NO_FILE =
  /^Astia Volume (?<volumeId>\S+?)(?:, Image (?<image>\d+))?: (?<volume>.*)$/su;

export function astiaFile(volumeId: string, fileId: string) {
  return `https://astia.narc.fi/uusiastia/ws/getFile.php?fileId=${fileId}&aineistoId=${volumeId}`;
}

export function imageTitle(volume: string, image: number) {
  return `${volume}, Image ${image}`;
}

export function importedPageNote(page: string) {
  return `${IMPORTED_PAGE}${page}`;
}

// The NOTE for a link no FILE points at.
export function noFileNote(
  volumeId: string,
  volume: string,
  image: number | null
) {
  const at = image === null ? '' : `, Image ${image}`;
  return `Astia Volume ${volumeId}${at}: ${volume}`;
}

// What an OBJE record's FILE and its TITL say of an Astia Image, or null
// for any other file.
export function astiaImageOf(file: string, title: string | null) {
  const f = ASTIA_FILE.exec(file)?.groups;
  const t = title === null ? undefined : IMAGE_TITLE.exec(title)?.groups;
  if (f === undefined || t === undefined) return null;
  return {
    volumeId: f.volumeId!,
    fileId: f.fileId!,
    volume: t.volume!,
    image: Number(t.image)
  };
}

export function importedPageOf(note: string) {
  return note.startsWith(IMPORTED_PAGE)
    ? note.slice(IMPORTED_PAGE.length)
    : null;
}

export function noFileLinkOf(note: string) {
  const g = NO_FILE.exec(note)?.groups;
  if (g === undefined) return null;
  return {
    volumeId: g.volumeId!,
    volume: g.volume!,
    image: g.image === undefined ? null : Number(g.image)
  };
}

// ---------------------------------------------------------------- reading

// What a citation's lines say of its link, in the columns it's stored in.
export interface LinkColumns {
  importedPage: string | null;
  volumeId: string;
  volume: string;
  image: number | null;
  fileId: string | null;
  box: { left: number; top: number; width: number; height: number } | null;
  by: 'hand' | 'vision';
}

// ---------------------------------------------------------------- writing

function cropOf(c: CitationRow) {
  if (c.link_box_left === null) return [];
  return [
    line('CROP', null, [
      line('TOP', String(c.link_box_top)),
      line('LEFT', String(c.link_box_left)),
      line('HEIGHT', String(c.link_box_height)),
      line('WIDTH', String(c.link_box_width))
    ])
  ];
}

// The citations' links, and the OBJE records of the Images they point at:
// one per Image, named apart from `taken`.
export function astiaLinkExport(taken: Set<string>) {
  const records: OutLine[] = [];
  const byFile = new Map<string, string>();
  let counter = 0;

  function newXref() {
    for (;;) {
      counter += 1;
      const xref = `@A${counter}@`;
      if (!taken.has(xref)) return xref;
    }
  }

  function recordOf(volumeId: string, fileId: string, title: string) {
    const file = astiaFile(volumeId, fileId);
    const known = byFile.get(file);
    if (known !== undefined) return known;
    const xref = newXref();
    byFile.set(file, xref);
    records.push({
      tag: 'OBJE',
      xref,
      children: [
        line('FILE', file, [line('FORM', 'image/jpeg'), line('TITL', title)])
      ]
    });
    return xref;
  }

  // The citation's OBJE for its link, and the notes saying what else it is.
  function linesOf(c: CitationRow) {
    if (c.link_volume_id === null) return { objects: [], notes: [] };
    const volume = c.link_volume ?? c.link_volume_id;
    const { link_image: image, link_file_id: fileId } = c;
    const filed = image !== null && fileId !== null;
    const objects = filed
      ? [
          pointer(
            'OBJE',
            recordOf(c.link_volume_id, fileId, imageTitle(volume, image)),
            cropOf(c)
          )
        ]
      : [];
    const notes = [
      ...(c.imported_page === null
        ? []
        : [line('NOTE', importedPageNote(c.imported_page))]),
      ...(filed
        ? []
        : [line('NOTE', noFileNote(c.link_volume_id, volume, image))]),
      ...(c.link_by === 'vision' ? [line('NOTE', UNCHECKED)] : [])
    ];
    return { objects, notes };
  }

  return { linesOf, records };
}
