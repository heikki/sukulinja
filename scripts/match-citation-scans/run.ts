// The bulk pass: match every Church-book reference not already pinned to
// its exact Image with the Reader, and save the confirmed ones into the
// dataset's citations, where the app reads them. It is resumable: every
// reading is cached, and what was saved is pinned, so a re-run skips it.

import type { Database } from 'bun:sqlite';
import { join } from 'node:path';

import { openAstia, viewerUrl } from '@/server/citations/astia/astia';
import type { Astia, ImageRef } from '@/server/citations/astia/astia';
import type { Viewport } from '@/server/citations/astia/jpeg';
import { RIPPI_COLLECTION } from '@/server/citations/myheritage/record';
import type { ChurchBookRef } from '@/server/citations/myheritage/record';
import { openScanFolder } from '@/server/citations/myheritage/scans';
import type { Match, Scans } from '@/server/citations/myheritage/scans';

import { gateRefusal } from '../vision/gate';
import { matchRef } from '../vision/matcher';
import type { Miss, MissReason } from '../vision/matcher';
import { cachedReader } from '../vision/reader';
import type { Reader } from '../vision/reader';

export type Books = 'rippikirjat' | 'index';

interface RunOptions {
  root: string;
  // The dataset's database, which the matches are saved into.
  db: Database;
  refs: ChurchBookRef[];
  reader: Reader;
  // The full-size Image's size, which a Box is saved in pixels of; null
  // when it can't be had.
  sizeOf: (at: ImageRef) => Promise<Viewport | null>;
  // By default over HTTP, kept in the data folder.
  astia?: Astia;
  dryRun?: boolean;
  parish?: string;
  // Only rippikirja references (searched by page), or only index
  // references (searched by date).
  books?: Books;
  // An Astia Volume id: only references with it among their candidates.
  volume?: string;
  // How many references to match at most.
  limit?: number;
  log?: (line: string) => void;
  // Dollars spent so far, for the progress lines; null if unknown.
  spent?: () => number | null;
}

interface ReviewEntry {
  // Or a Match Scans wouldn't save there, which only a bug makes.
  reason: MissReason | 'refused';
  parish: string;
  name: string | null;
  cited: string | null;
  record: string;
  volume: string | null;
  image: number | null;
  link: string | null;
}

type RunResult =
  | { refused: string }
  | { outcomes: string[]; review: ReviewEntry[]; saved: number };

// Reasons not worth a look by hand here: a rippikirja reference with no
// page needs a village map first.
const NOT_REVIEWED = new Set<MissReason>(['unsupported']);

function kindOf(ref: ChurchBookRef) {
  const kind = ref.kind ?? '?';
  return kind === 'kastetut' || kind === 'vihityt' || ref.page !== null
    ? kind
    : `${kind} (no page)`;
}

function cited(ref: ChurchBookRef) {
  return ref.page === null ? ref.date : `p. ${ref.page}`;
}

// What a run matches with, and saves into.
interface Pass {
  scans: Scans;
  astia: Astia;
  reader: Reader;
}

async function link(
  astia: Astia,
  volumeId: string | undefined,
  image: number | undefined
) {
  if (volumeId === undefined || image === undefined) return null;
  const fileId = (await astia.volumeImages(volumeId))[image - 1];
  return fileId === undefined ? null : viewerUrl(volumeId, fileId);
}

async function reviewEntry(
  astia: Astia,
  ref: ChurchBookRef,
  reason: ReviewEntry['reason'],
  where: Pick<Miss, 'volumeId' | 'volume' | 'image'> | null
): Promise<ReviewEntry> {
  return {
    reason,
    parish: ref.parish ?? '?',
    name: ref.name,
    cited: cited(ref),
    record: ref.url,
    volume: where?.volume ?? null,
    image: where?.image ?? null,
    link: await link(astia, where?.volumeId, where?.image)
  };
}

function dollars(spent: (() => number | null) | undefined) {
  const n = spent?.();
  return n === undefined ? '' : n === null ? ' · $?' : ` · $${n.toFixed(2)}`;
}

// Whether the reference is up for matching: not pinned yet, by hand or by
// the model, in a Volume the existing resolution finds. Otherwise, the
// tally key saying why not.
async function standing(scans: Scans, ref: ChurchBookRef) {
  const resolved = await scans.resolveRef(ref);
  if ('unlinked' in resolved) return resolved.unlinked;
  return resolved.links.some(
    (l) => l.certainty === 'marked' || l.certainty === 'match'
  )
    ? 'already pinned'
    : null;
}

// What became of one reference: its tally key (none when the filters
// leave it out), whether it was matched and saved, and what goes on the
// review list.
interface Done {
  key: string | null;
  tried: boolean;
  saved: boolean;
  entry: ReviewEntry | null;
}

function progress(
  n: number,
  ref: ChurchBookRef,
  match: Match | Miss,
  cost: string
) {
  const outcome = match.confirmed ? 'confirmed' : match.reason;
  const where = match.confirmed
    ? ` → ${match.volume}, Image ${match.image}`
    : '';
  return `[${n}] ${outcome}: ${ref.name ?? '?'}, ${ref.parish ?? '?'} ${cited(ref) ?? ''}${where}${cost}`;
}

const LEFT_OUT: Done = { key: null, tried: false, saved: false, entry: null };

// Done already, when the reference isn't up for matching.
async function skipped(
  { scans, astia }: Pass,
  ref: ChurchBookRef
): Promise<Done | null> {
  const skip = await standing(scans, ref);
  if (skip === null) return null;
  const entry =
    skip === 'no-volume'
      ? await reviewEntry(astia, ref, 'no candidate volume', null)
      : null;
  return { key: `${kindOf(ref)} ✗ ${skip}`, tried: false, saved: false, entry };
}

async function settle(
  options: RunOptions,
  { scans, astia }: Pass,
  ref: ChurchBookRef,
  match: Match | Miss
): Promise<Done> {
  const key = `${kindOf(ref)} ${match.confirmed ? 'confirmed' : match.reason}`;
  if (match.confirmed) {
    const done = await scans.saveMatch(ref, match, {
      dryRun: options.dryRun === true
    });
    if ('rejected' in done) {
      return {
        key: `${kindOf(ref)} refused: ${done.rejected}`,
        tried: true,
        saved: false,
        entry: await reviewEntry(astia, ref, 'refused', match)
      };
    }
    if (done.saved) return { key, tried: true, saved: true, entry: null };
    return {
      key: `${kindOf(ref)} rejected`,
      tried: true,
      saved: false,
      entry: await reviewEntry(astia, ref, 'rejected', match)
    };
  }
  const entry = NOT_REVIEWED.has(match.reason)
    ? null
    : await reviewEntry(astia, ref, match.reason, match);
  return { key, tried: true, saved: false, entry };
}

// Whether the run leaves the reference out by its parish or books.
function leftOut(options: RunOptions, ref: ChurchBookRef) {
  const rippi = ref.collection === RIPPI_COLLECTION;
  const books = options.books;
  return (
    (options.parish !== undefined && ref.parish !== options.parish) ||
    (books !== undefined && rippi !== (books === 'rippikirjat'))
  );
}

async function matchOne(
  options: RunOptions,
  pass: Pass,
  ref: ChurchBookRef,
  n: number
): Promise<Done> {
  if (leftOut(options, ref)) return LEFT_OUT;
  const skip = await skipped(pass, ref);
  if (skip !== null) return skip;
  const candidates = await pass.scans.matchCandidates(ref);
  const volume = options.volume;
  if (volume !== undefined && !candidates.some((c) => c.volumeId === volume)) {
    return LEFT_OUT;
  }
  const match = await matchRef(ref, candidates, pass.reader);
  (options.log ?? console.log)(progress(n, ref, match, dollars(options.spent)));
  return await settle(options, pass, ref, match);
}

export async function runMatching(options: RunOptions): Promise<RunResult> {
  const { root } = options;
  const astia = options.astia ?? openAstia(join(root, '.astia-cache'));
  const scans = openScanFolder(root, { astia }).scans(options.db, {
    sizeOf: options.sizeOf
  });
  const reader = cachedReader(options.reader, join(root, '.vision-readings'));
  if (options.dryRun !== true) {
    const refusal = await gateRefusal(root, reader.models.entry);
    if (refusal !== null) return { refused: refusal };
  }
  const all: Done[] = [];
  let tried = 0;
  for (const ref of options.refs) {
    if (tried >= (options.limit ?? Infinity)) break;
    // eslint-disable-next-line no-await-in-loop -- one reference at a time
    const done = await matchOne(
      options,
      { scans, astia, reader },
      ref,
      tried + 1
    );
    all.push(done);
    if (done.tried) tried += 1;
  }
  return {
    outcomes: all.flatMap((d) => (d.key === null ? [] : [d.key])),
    review: all.flatMap((d) => (d.entry === null ? [] : [d.entry])),
    saved: all.filter((d) => d.saved).length
  };
}

function byPlace(a: ReviewEntry, b: ReviewEntry) {
  const parish = a.parish.localeCompare(b.parish, 'fi');
  if (parish !== 0) return parish;
  const volume = (a.volume ?? '').localeCompare(b.volume ?? '', 'fi');
  return volume === 0 ? (a.image ?? 0) - (b.image ?? 0) : volume;
}

function cell(text: string | number | null) {
  return text === null ? '' : String(text).replace(/\|/g, '\\|');
}

// The references to match by hand, by parish and Volume, each linking the
// Image the search ended on.
export function reviewMarkdown(review: ReviewEntry[]) {
  const rows = review.toSorted(byPlace);
  const lines = [
    '# References to match by hand',
    '',
    "The vision pass couldn't confirm these. Open the Image the search ended",
    'on, find the person near it, and mark the Image in the Scan viewer.',
    '',
    '| Reason | Parish | Volume | Image | Person | Cited | Record |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => {
      const image =
        r.image === null
          ? ''
          : r.link === null
            ? String(r.image)
            : `[${r.image}](${r.link})`;
      return `| ${r.reason} | ${cell(r.parish)} | ${cell(r.volume)} | ${image} | ${cell(r.name)} | ${cell(r.cited)} | [record](${r.record}) |`;
    })
  ];
  return `${lines.join('\n')}\n`;
}
