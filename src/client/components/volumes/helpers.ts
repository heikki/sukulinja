import type {
  BookKind,
  ChurchBookArchive,
  ChurchBookVolume,
  DownloadError,
  DownloadStatus,
  ListedBook,
  VolumeOnDisk,
  Years
} from '@/common/types';

import { formatBytes } from '../settings/helpers';

export type DownloadAction = 'start' | 'stop';

function whole(d: VolumeOnDisk) {
  return d.images !== null && d.images > 0 && d.cached === d.images;
}

// What can be done with a Volume's download, as its button says it: stop
// one on its way, or download one not yet whole on disk.
export function downloadActions(
  volume: ChurchBookVolume
): Array<{ action: DownloadAction; label: string }> {
  const state = volume.download?.state;
  if (state === 'queued' || state === 'downloading') {
    return [{ action: 'stop', label: 'Stop' }];
  }
  if (!volume.digitized || whole(volume.onDisk)) return [];
  return [{ action: 'start', label: 'Download' }];
}

const WHY: Record<DownloadError, string> = {
  'unreachable': "Astia couldn't be reached",
  'no-image': 'Astia gave no image',
  'rescanned': 'Astia has re-scanned it'
};

function ofImages(d: VolumeOnDisk) {
  return d.images === null ? `${d.cached}` : `${d.cached} of ${d.images}`;
}

// Where a download this run is, or why it stopped.
function downloadLine(download: DownloadStatus, onDisk: VolumeOnDisk) {
  switch (download.state) {
    case 'queued':
      return 'Waiting to download';
    case 'downloading':
      return `Downloading ${ofImages(onDisk)}`;
    case 'stopped': {
      const why = download.error === null ? '' : `: ${WHY[download.error]}`;
      return `Stopped at ${ofImages(onDisk)}${why}`;
    }
  }
}

// What of a Volume is on disk, and its download, in a line under its
// title.
export function diskLine(volume: ChurchBookVolume) {
  if (!volume.digitized) return 'Not digitized';
  const { download, onDisk } = volume;
  const size = onDisk.bytes > 0 ? ` · ${formatBytes(onDisk.bytes)}` : '';
  const going =
    download?.state === 'queued' || download?.state === 'downloading';
  if (whole(onDisk) && !going) return `On disk${size}`;
  if (download !== null) return `${downloadLine(download, onDisk)}${size}`;
  if (onDisk.cached === 0) return 'Not on disk';
  return `${ofImages(onDisk)} Images on disk${size}`;
}

// Whether any of the Volumes is downloading or waiting to: then the list
// is asked for again until none is.
export function busy(volumes: ChurchBookVolume[]) {
  return volumes.some(
    (v) => v.download?.state === 'queued' || v.download?.state === 'downloading'
  );
}

// The install's parishes the dataset's own archives leave out, in the
// order they were added.
export function othersOf(own: ChurchBookArchive[], all: ChurchBookArchive[]) {
  const ids = new Set(own.map((a) => a.archiveId));
  return all.filter((a) => !ids.has(a.archiveId));
}

// Each series of church book by its short name, in the order a parish's
// books are listed: the rippikirjat first.
export const SERIES: ReadonlyArray<{ kind: BookKind; name: string }> = [
  { kind: 'rippi', name: 'Rippikirjat' },
  { kind: 'lasten', name: 'Lastenkirjat' },
  { kind: 'kastetut', name: 'Kastetut' },
  { kind: 'vihityt', name: 'Vihityt' },
  { kind: 'haudatut', name: 'Haudatut' }
];

// A series' short name; the empty string for a Volume of none.
export function seriesName(kind: BookKind | null) {
  return SERIES.find((s) => s.kind === kind)?.name ?? '';
}

function seriesOrder(kind: BookKind | null) {
  const at = SERIES.findIndex((s) => s.kind === kind);
  return at === -1 ? SERIES.length : at;
}

// "1790–1796", one year alone, or the empty string.
export function yearsText(years: Years | null) {
  if (years === null) return '';
  return years.from === years.to
    ? `${years.from}`
    : `${years.from}–${years.to}`;
}

// By series, then by first year; a Volume whose years can't be read last
// in its series.
export function bySeries<T extends Pick<ChurchBookVolume, 'kind' | 'years'>>(
  a: T,
  b: T
) {
  const series = seriesOrder(a.kind) - seriesOrder(b.kind);
  if (series !== 0) return series;
  return (a.years?.from ?? Infinity) - (b.years?.from ?? Infinity);
}

// A Volume with the archive holding it; null when none of the install's
// parishes has it.
type InArchive = Pick<ChurchBookVolume, 'kind' | 'years'> & {
  archiveId: string | null;
  archive: string | null;
};

export interface ArchiveGroup<T extends InArchive> {
  archiveId: string | null;
  archive: string | null;
  books: T[];
}

// The Volumes by archive, in the order the archives come, each one's by
// series and years.
export function groupByArchive<T extends InArchive>(
  books: T[]
): Array<ArchiveGroup<T>> {
  const groups = new Map<string | null, ArchiveGroup<T>>();
  for (const book of books) {
    const group = groups.get(book.archiveId) ?? {
      archiveId: book.archiveId,
      archive: book.archive,
      books: []
    };
    group.books.push(book);
    groups.set(book.archiveId, group);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    books: g.books.toSorted(bySeries)
  }));
}

// Whether the Volume answers what's typed: a year it covers, or words in
// its label, series or archive.
export function matches(
  book: Pick<ListedBook, 'label' | 'kind' | 'years'> & {
    archive?: string | null;
  },
  typed: string
) {
  const words = typed.trim().toLowerCase();
  if (words === '') return true;
  if (/^\d{4}$/u.test(words)) {
    const year = Number(words);
    return (
      book.years !== null && book.years.from <= year && year <= book.years.to
    );
  }
  return [book.label, seriesName(book.kind), book.archive ?? '']
    .join(' ')
    .toLowerCase()
    .includes(words);
}

// How much of a Volume is on disk, as a share of its Images: never 100%
// short of whole, nor 0% once any is there.
function share(d: VolumeOnDisk) {
  if (d.images === null || d.images === 0) return `${d.cached} Images`;
  const pct = Math.floor((d.cached / d.images) * 100);
  if (pct === 0 && d.cached > 0) return '<1%';
  return `${Math.min(pct, 99)}%`;
}

// What of a Volume is on disk, in a table's cell: its line made short,
// the share of its Images in place of their count, which `diskLine`
// gives whole for its tooltip; "—" for nothing.
export function diskCell(volume: ChurchBookVolume) {
  if (!volume.digitized) return 'Not digitized';
  const { download, onDisk } = volume;
  const size = onDisk.bytes > 0 ? ` · ${formatBytes(onDisk.bytes)}` : '';
  const state = download?.state;
  if (state === 'queued') return 'Waiting';
  if (state === 'downloading') return `Downloading ${share(onDisk)}`;
  if (state === 'stopped' && !whole(onDisk)) {
    return `Stopped at ${share(onDisk)}${size}`;
  }
  if (whole(onDisk)) return `On disk${size}`;
  if (onDisk.cached === 0) return '—';
  return `${share(onDisk)}${size}`;
}

// The Book list in a line: how many, how many cited, and how many whole
// on disk.
function counted(k: number, one: string, many: string) {
  return k === 1 ? `1 ${one}` : `${k} ${many}`;
}

export function listSummary(books: ListedBook[]) {
  const cited = books.filter((b) => b.cited > 0).length;
  const onDisk = books.filter((b) => whole(b.onDisk)).length;
  return [
    counted(books.length, 'volume', 'volumes'),
    `${cited} cited`,
    `${onDisk} on disk`
  ].join(' · ');
}

// An archival code as Astia's labels begin with it, written this way or
// near it: "I Aa:10", "I Aa: 10", "IAa:10", "I Aa 10b", "Aa:10".
const CODE = /^(?:[IVX]+\s*)?[A-Z][a-z]?\s*:?\s*\d+[a-z]?(?![\p{L}\d])/u;

// A Volume's archival code, as its Astia label begins ("I Aa:10" of "I
// Aa:10 Pää- ja rippikirjat (1790-1796)"). A label without one is short
// of what its series and years, shown beside it, say: the villages it
// holds, or "–".
export function volumeCode(label: string) {
  const code = CODE.exec(label)?.[0];
  if (code !== undefined) return code.replaceAll(/\s+/gu, ' ');
  const rest = label
    .replace(/\s*\(\d{4}(?:-\d{4})?\)\s*$/u, '')
    .split(',')
    .slice(1)
    .filter((part) => !/^\s*[\d\s,-]+$/u.test(part))
    .join(',')
    .trim();
  return rest === '' ? '–' : rest;
}
