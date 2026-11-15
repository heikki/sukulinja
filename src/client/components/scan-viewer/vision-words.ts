import { imageLabel } from '@/client/on';
import { CLAUDE_MODELS } from '@/common/assistant-choices';
import type { VisionTry } from '@/common/types';

// Why a search saved no Match, as the matcher says it, in a sentence.
const MISSED: Record<string, string> = {
  'name not found': "The name wasn't found on the Images searched.",
  'unreadable': 'The scans were too hard to read.',
  'did not converge': "The search didn't close in on the cited page.",
  'ambiguous': 'Found in more than one Volume, so neither was saved.',
  'no candidate volume': 'There is no Volume to search.',
  'no name': 'The reference names no one to look for.',
  'no box': 'Found, but not where on the Image.',
  'unsupported': "This kind of reference isn't searched."
};

export function modelLabel(model: string) {
  return CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model;
}

// "$0.004": to a tenth of a cent under a cent.
function dollarWords(dollars: number | null) {
  if (dollars === null) return 'cost unknown';
  return `$${dollars.toFixed(dollars < 0.01 ? 3 : 2)}`;
}

// What it found: the Match's Image, or why there's none.
export function foundWords(tried: VisionTry) {
  if (tried.missed !== null) return missedWords(tried.missed);
  const links = 'links' in tried.links ? tried.links.links : [];
  const match = links.find((l) => l.certainty === 'match');
  const at =
    match === undefined || match.precision === 'volume'
      ? ''
      : ` on ${imageLabel(match.volume, match.image)}`;
  return `Found${at}. Right-click its box to confirm or discard it.`;
}

// What a search took, one's or a batch's.
type Took = Pick<
  VisionTry,
  'model' | 'readings' | 'cached' | 'dollars' | 'seconds'
>;

// Each try a batch made, summed as one.
export function batchTook(
  tries: VisionTry[],
  model: string,
  seconds: number
): Took {
  return {
    model,
    readings: tries.reduce((n, t) => n + t.readings, 0),
    cached: tries.reduce((n, t) => n + t.cached, 0),
    dollars: tries.reduce<number | null>(
      (sum, t) => (sum === null || t.dollars === null ? null : sum + t.dollars),
      0
    ),
    seconds
  };
}

// The Image a try's Match is on, or null for none.
function matchImage(tried: VisionTry) {
  if (tried.missed !== null || !('links' in tried.links)) return null;
  const match = tried.links.links.find((l) => l.certainty === 'match');
  return match === undefined || match.precision === 'volume'
    ? null
    : match.image;
}

// How many of a batch's tries on `image` found their entry, and which
// Images the ones found elsewhere are on: "Found 5 of 7, their boxes on
// the scan; 1 on Image 13."
export function batchFoundWords(tries: VisionTry[], of: number, image: number) {
  const images = tries.flatMap((t) => {
    const at = matchImage(t);
    return at === null ? [] : [at];
  });
  if (images.length === 0) return `Found none of ${of}.`;
  const elsewhere = images
    .filter((at) => at !== image)
    .toSorted((x, y) => x - y);
  const found = `Found ${images.length} of ${of}`;
  const here =
    images.length > elsewhere.length ? ', their boxes on the scan' : '';
  const away =
    elsewhere.length === 0
      ? ''
      : `; ${elsewhere.length} on Image ${[...new Set(elsewhere)].join(', ')}`;
  return `${found}${here}${away}.`;
}

// Why a try found none, in a sentence.
export function missedWords(missed: string) {
  return MISSED[missed] ?? missed;
}

// What it took: "14 readings, 3 of them kept from before · $0.004 · 41 s ·
// Haiku 5.5".
export function costWords(tried: Took) {
  const kept =
    tried.cached === 0 ? '' : `, ${tried.cached} of them kept from before`;
  const plural = tried.readings === 1 ? '' : 's';
  return [
    `${tried.readings} reading${plural}${kept}`,
    dollarWords(tried.dollars),
    `${tried.seconds} s`,
    modelLabel(tried.model)
  ].join(' · ');
}
