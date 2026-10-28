// A Mark or Match in GEDCOM 7 (ADR-0013), written by the export and
// read back by the import. A link to an Image is an OBJE under the
// citation, pointing at an OBJE record per Image whose FILE is the Image's
// JPEG in Astia, titled with its Volume and Image number; the Box is the
// link's CROP. The original page is a NOTE, and so is a Match
// nobody has checked, a link with no file to point at (only a Volume, or
// an Image whose file id wasn't known), and a citation made in the app.

import type { Annotation, CitationLink } from '../citations';
import { line, pointer } from './writer';
import type { OutLine } from './writer';

const ASTIA_FILE =
  /^https:\/\/astia\.narc\.fi\/uusiastia\/ws\/getFile\.php\?fileId=(?<fileId>[^&]+)&aineistoId=(?<volumeId>[^&]+)$/u;
const IMAGE_TITLE = /^(?<volume>.*), Image (?<image>\d+)$/su;
const ORIGINAL_PAGE = 'Original page: ';
export const UNCHECKED = 'Found by the vision model, not checked by hand';
export const ADDED_IN_APP = 'Added in Sukulinja';
const NO_FILE =
  /^Astia Volume (?<volumeId>\S+?)(?:, Image (?<image>\d+))?: (?<volume>.*)$/su;

function astiaFile(volumeId: string, fileId: string) {
  return `https://astia.narc.fi/uusiastia/ws/getFile.php?fileId=${fileId}&aineistoId=${volumeId}`;
}

function imageTitle(volume: string, image: number) {
  return `${volume}, Image ${image}`;
}

function originalPageNote(page: string) {
  return `${ORIGINAL_PAGE}${page}`;
}

// The NOTE for a link no FILE points at.
function noFileNote(volumeId: string, volume: string, image: number | null) {
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

export function originalPageOf(note: string) {
  return note.startsWith(ORIGINAL_PAGE)
    ? note.slice(ORIGINAL_PAGE.length)
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

// ---------------------------------------------------------------- writing

function cropOf({ box }: CitationLink) {
  if (box === undefined) return [];
  return [
    line('CROP', null, [
      line('TOP', String(box.top)),
      line('LEFT', String(box.left)),
      line('HEIGHT', String(box.height)),
      line('WIDTH', String(box.width))
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

  // The link's OBJE, or the NOTE naming it when it has no file.
  function linkLines(link: CitationLink | null) {
    if (link === null) return { objects: [], notes: [] };
    const { volumeId, volume, image, fileId } = link;
    if (image === undefined || fileId === undefined) {
      const note = noFileNote(volumeId, volume, image ?? null);
      return { objects: [], notes: [line('NOTE', note)] };
    }
    const record = recordOf(volumeId, fileId, imageTitle(volume, image));
    return { objects: [pointer('OBJE', record, cropOf(link))], notes: [] };
  }

  // The citation's OBJE for its link, and the notes saying what else its
  // Annotation holds.
  function linesOf({ link, originalPage, madeInApp }: Annotation) {
    const linked = linkLines(link);
    const notes = [
      ...(originalPage === null
        ? []
        : [line('NOTE', originalPageNote(originalPage))]),
      ...linked.notes,
      ...(link?.by === 'vision' ? [line('NOTE', UNCHECKED)] : []),
      ...(madeInApp ? [line('NOTE', ADDED_IN_APP)] : [])
    ];
    return { objects: linked.objects, notes };
  }

  return { linesOf, records };
}
