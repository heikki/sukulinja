// Reading a citation's Mark or Vision match back from a GEDZIP the export
// wrote (astia-links.ts). The lines it reads are taken off the citation,
// so its notes and media are read without them.

import type { LinkColumns } from './astia-links';
import {
  astiaImageOf,
  importedPageOf,
  noFileLinkOf,
  UNCHECKED
} from './astia-links';
import type { LineReader } from './gedcom-lines';
import { childValue, findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';

type AstiaImage = NonNullable<ReturnType<typeof astiaImageOf>>;

// The OBJE records of Astia Images, by xref.
export function astiaRecords(roots: GedNode[]) {
  const out = new Map<string, { record: GedNode; image: AstiaImage }>();
  for (const record of roots) {
    if (record.tag !== 'OBJE' || record.xref === undefined) continue;
    const file = findChild(record, 'FILE');
    const image =
      file?.value === undefined
        ? null
        : astiaImageOf(file.value, childValue(file, 'TITL') ?? null);
    if (image !== null) out.set(record.xref, { record, image });
  }
  return out;
}

function uncheckedOf(text: string) {
  return text === UNCHECKED ? text : null;
}

// The citation's columns for its link, in the order the import writes them.
export function linkValues(link: LinkColumns | null) {
  if (link === null) return Array<null>(10).fill(null);
  const { box } = link;
  return [
    link.importedPage,
    link.volumeId,
    link.volume,
    link.image,
    link.fileId,
    box === null ? null : box.left,
    box === null ? null : box.top,
    box === null ? null : box.width,
    box === null ? null : box.height,
    link.by
  ];
}

function toInt(value: string | undefined) {
  const n = value === undefined ? NaN : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function linkReader(roots: GedNode[], lines: LineReader) {
  const records = astiaRecords(roots);
  const { use, take } = lines;

  function useRecord(record: GedNode) {
    use(record);
    const file = take(record, 'FILE')!;
    take(file, 'FORM');
    take(file, 'TITL');
  }

  function boxOf(link: GedNode) {
    const crop = take(link, 'CROP');
    if (crop === undefined) return null;
    const [top, left, height, width] = ['TOP', 'LEFT', 'HEIGHT', 'WIDTH'].map(
      (side) => toInt(take(crop, side)?.value)
    );
    if ([top, left, height, width].includes(null)) return null;
    return { left: left!, top: top!, width: width!, height: height! };
  }

  // The link the citation's lines give, if any, with those lines taken off
  // it.
  return function readLink(sour: GedNode): LinkColumns | null {
    const taken = new Set<GedNode>();
    const object = findChildren(sour, 'OBJE').find((o) =>
      records.has(o.value ?? '')
    );
    const notes = findChildren(sour, 'NOTE');
    function noteWith<T>(read: (text: string) => T | null) {
      for (const note of notes) {
        const found = note.value === undefined ? null : read(note.value);
        if (found !== null && !taken.has(note)) {
          taken.add(note);
          use(note);
          return found;
        }
      }
      return null;
    }
    let link: LinkColumns | null = null;
    if (object === undefined) {
      const noFile = noteWith(noFileLinkOf);
      if (noFile !== null) {
        link = {
          importedPage: null,
          ...noFile,
          fileId: null,
          box: null,
          by: 'hand'
        };
      }
    } else {
      const { record, image } = records.get(object.value!)!;
      taken.add(object);
      use(object);
      useRecord(record);
      link = {
        importedPage: noteWith(importedPageOf),
        volumeId: image.volumeId,
        volume: image.volume,
        image: image.image,
        fileId: image.fileId,
        box: boxOf(object),
        by: 'hand'
      };
    }
    if (link !== null && noteWith(uncheckedOf) !== null) link.by = 'vision';
    for (let i = sour.children.length - 1; i >= 0; i -= 1) {
      if (taken.has(sour.children[i]!)) sour.children.splice(i, 1);
    }
    return link;
  };
}
