// Moves the Record pins, Reference pins and Rejections saved in a data
// folder's pins.local.json into the citations of its datasets (ADR-0013),
// once. A pin goes into every dataset citing its record (or its URL, for a
// reference with no Record number), its Box from fractions of the Image to
// pixels. A pin no dataset cites, or whose Box can't be converted, is
// listed and stays in the file for a later run; Page pins and Record
// ranges stay where they are.

import { join } from 'node:path';

import type { Box } from '@common/types';
import type { Viewport } from '@server/citation-scans/jpeg';
import type { RecordPin, ReferencePin } from '@server/citation-scans/locate';
import { openMarks } from '@server/citation-scans/marks';
import type { CitationLink, Marks } from '@server/citation-scans/marks';
import {
  readLocalFile,
  withLock,
  writeLocalFile
} from '@server/citation-scans/pin-files';
import type { LocalPins } from '@server/citation-scans/pin-files';
import type { ImageRef } from '@server/citation-scans/reader';
import { markedRefOf, markKey } from '@server/citation-scans/record';
import type { DatasetRegistry } from '@server/dataset-registry';

export type SizeOf = (at: ImageRef) => Promise<Viewport | null>;

// A Box saved in fractions of its Image, in whole pixels of it.
function inPixels(box: Box, size: Viewport): Box {
  const left = Math.round(box.left * size.width);
  const top = Math.round(box.top * size.height);
  const right = Math.min(
    size.width,
    Math.round((box.left + box.width) * size.width)
  );
  const bottom = Math.min(
    size.height,
    Math.round((box.top + box.height) * size.height)
  );
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

interface Pin {
  volumeId: string;
  volume: string;
  image?: number;
  box?: Box;
  fileId?: string;
  by?: 'hand' | 'vision';
}

// The pin as a citation's link, its Box in pixels; null when the Box needs
// a size that can't be had.
async function linkOf(pin: Pin, sizeOf: SizeOf) {
  const { volumeId, volume, image, box, fileId } = pin;
  const link: CitationLink = { volumeId, volume, by: pin.by ?? 'hand' };
  if (image !== undefined) link.image = image;
  if (fileId !== undefined) link.fileId = fileId;
  if (box !== undefined && image !== undefined) {
    const size = await sizeOf({ volumeId, image });
    if (size === null) return null;
    link.box = inPixels(box, size);
  }
  return link;
}

// Writes the link into the datasets citing the key; whether one did. A
// Mark there already isn't replaced by a Vision match.
function place(datasets: Marks[], key: string, link: CitationLink) {
  const citing = datasets.filter((m) => m.cites(key));
  for (const marks of citing) {
    marks.change(() => {
      const known = marks.linkOf(key);
      if (link.by === 'vision' && known?.by === 'hand') return;
      marks.write(key, link);
    });
  }
  return citing.length > 0;
}

export interface MoveResult {
  moved: number;
  // What stayed in the file, and why.
  left: string[];
}

// Each Record pin, by its Volume.
function recordPins(local: LocalPins) {
  return Object.entries(local.volumes).flatMap(([volumeId, v]) =>
    (v.records ?? []).map((pin) => ({
      volumeId,
      volume: v.title ?? volumeId,
      pin
    }))
  );
}

function referenceKey(url: string) {
  const ref = markedRefOf(url);
  return ref === null ? `url ${url}` : markKey(ref);
}

// One pin moved into the datasets citing its key: whether it was, and if
// not, why.
async function moveOne(
  datasets: Marks[],
  key: string,
  pin: Pin,
  sizeOf: SizeOf
) {
  const link = await linkOf(pin, sizeOf);
  if (link === null) return 'no size for its Image';
  return place(datasets, key, link) ? null : 'no dataset cites it';
}

interface Move {
  datasets: Marks[];
  sizeOf: SizeOf;
  left: string[];
}

// Record pins go first: a reference's own pin decided its Link over its
// record's, so it's written last. The pins left, by Volume.
async function moveRecords(move: Move, local: LocalPins) {
  const kept = new Map<string, RecordPin[]>();
  for (const { volumeId, volume, pin } of recordPins(local)) {
    // eslint-disable-next-line no-await-in-loop -- one Image at a time
    const why = await moveOne(
      move.datasets,
      `record ${pin.record}`,
      { ...pin, volumeId, volume },
      move.sizeOf
    );
    if (why === null) continue;
    move.left.push(
      `Record pin ${pin.record} (Volume ${volumeId}, Image ${pin.image}): ${why}`
    );
    kept.set(volumeId, [...(kept.get(volumeId) ?? []), pin]);
  }
  return kept;
}

async function moveReferences(move: Move, local: LocalPins) {
  const kept: Record<string, ReferencePin> = {};
  for (const [url, pin] of Object.entries(local.references)) {
    // eslint-disable-next-line no-await-in-loop -- one Image at a time
    const why = await moveOne(
      move.datasets,
      referenceKey(url),
      pin,
      move.sizeOf
    );
    if (why === null) continue;
    move.left.push(`Reference pin ${url} (Volume ${pin.volumeId}): ${why}`);
    kept[url] = pin;
  }
  return kept;
}

function moveRejections(move: Move, local: LocalPins) {
  const kept: LocalPins['rejected'] = {};
  for (const [url, list] of Object.entries(local.rejected)) {
    const citing = move.datasets.filter((m) => m.citesUrl(url));
    if (citing.length === 0) {
      move.left.push(`Rejections of ${url}: no dataset cites it`);
      kept[url] = list;
      continue;
    }
    for (const marks of citing) {
      marks.change(() => {
        for (const r of list) marks.reject(url, r);
      });
    }
  }
  return kept;
}

function count(local: LocalPins) {
  return (
    recordPins(local).length +
    Object.keys(local.references).length +
    Object.values(local.rejected).flat().length
  );
}

export async function movePins(
  root: string,
  registry: DatasetRegistry,
  sizeOf: SizeOf
): Promise<MoveResult> {
  const datasets = (await registry.list())
    .filter((d) => !d.outdated)
    .map((d) => openMarks(registry.open(d.slug)));
  const file = join(root, 'pins.local.json');
  return await withLock(join(root, 'pins.lock'), async () => {
    const local = await readLocalFile(file);
    const move = { datasets, sizeOf, left: [] };
    const records = await moveRecords(move, local);
    const kept: LocalPins = {
      volumes: Object.fromEntries(
        Object.entries(local.volumes).map(([id, v]) => {
          const { records: _moved, ...rest } = v;
          const left = records.get(id);
          return [id, left === undefined ? rest : { ...rest, records: left }];
        })
      ),
      references: await moveReferences(move, local),
      rejected: moveRejections(move, local)
    };
    await writeLocalFile(file, kept);
    return { moved: count(local) - count(kept), left: move.left };
  });
}
