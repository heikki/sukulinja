// Reading a citation's Annotation back from a GEDZIP the export wrote
// (astia-links.ts). The lines it reads are taken off the citation, so its
// notes and media are read without them.

import type { Annotation, CitationLink } from './annotations';
import {
  ADDED_IN_APP,
  astiaImageOf,
  noFileLinkOf,
  originalPageOf,
  UNCHECKED
} from './astia-links';
import type { LineReader } from './gedcom-lines';
import { childValue, findChild, findChildren } from './gedcom-parser';
import type { GedNode } from './gedcom-parser';

type AstiaImage = NonNullable<ReturnType<typeof astiaImageOf>>;

// The OBJE records of Astia Images, by xref.
function astiaRecords(roots: GedNode[]) {
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

function noteOf(wanted: string) {
  return (text: string) => (text === wanted ? text : null);
}

function toInt(value: string | undefined) {
  const n = value === undefined ? NaN : parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function annotationReader(roots: GedNode[], lines: LineReader) {
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

  // The Annotation the citation's lines give, with those lines taken off
  // it.
  return function readAnnotation(sour: GedNode): Annotation {
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
    let link: CitationLink | null = null;
    if (object === undefined) {
      const noFile = noteWith(noFileLinkOf);
      if (noFile !== null) {
        const { image, ...rest } = noFile;
        link = { ...rest, ...(image === null ? {} : { image }), by: 'hand' };
      }
    } else {
      const { record, image } = records.get(object.value!)!;
      taken.add(object);
      use(object);
      useRecord(record);
      const box = boxOf(object);
      link = { ...image, ...(box === null ? {} : { box }), by: 'hand' };
    }
    if (link !== null && noteWith(noteOf(UNCHECKED)) !== null) {
      link.by = 'vision';
    }
    const originalPage = noteWith(originalPageOf);
    const madeInApp = noteWith(noteOf(ADDED_IN_APP)) !== null;
    for (let i = sour.children.length - 1; i >= 0; i -= 1) {
      if (taken.has(sour.children[i]!)) sour.children.splice(i, 1);
    }
    return { link, originalPage, madeInApp };
  };
}
