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
  if (tried.missed !== null) return MISSED[tried.missed] ?? tried.missed;
  const links = 'links' in tried.links ? tried.links.links : [];
  const match = links.find((l) => l.certainty === 'match');
  const at =
    match === undefined || match.precision === 'volume'
      ? ''
      : ` on ${imageLabel(match.volume, match.image)}`;
  return `Found${at}. Right-click its box to confirm or discard it.`;
}

// What it took: "14 readings, 3 of them kept from before · $0.004 · 41 s ·
// Haiku 5.5".
export function costWords(tried: VisionTry) {
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
