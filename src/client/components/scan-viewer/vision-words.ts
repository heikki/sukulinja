import { matchAt } from '@/client/state/vision-batch';
import type { Surveyed, Took } from '@/client/state/vision-batch';
import { CLAUDE_MODELS } from '@/common/assistant-choices';
import type { VisionTry } from '@/common/types';

export function modelLabel(model: string) {
  return CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model;
}

// "$0.004": to a tenth of a cent under a cent.
function dollarWords(dollars: number | null) {
  if (dollars === null) return 'cost unknown';
  return `$${dollars.toFixed(dollars < 0.01 ? 3 : 2)}`;
}

// How many of a batch's tries on `image` found their entry, and which
// Images the ones found elsewhere are on: "Found 5 of 7, their boxes on
// the scan; 1 on Image 13."
export function batchFoundWords(tries: VisionTry[], of: number, image: number) {
  const images = tries.flatMap((t) => {
    const at = matchAt(t);
    return at === null ? [] : [at.image];
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

// What a page survey read: "Page numbers read on 9 Images, all agreeing."
export function surveyWords({ pinned, settled }: Surveyed) {
  if (pinned === 0) return 'No page numbers could be read.';
  const on = pinned === 1 ? '1 Image' : `${pinned} Images`;
  const agree = settled
    ? 'all agreeing'
    : 'some still disagreeing when it ran out of readings';
  return `Page numbers read on ${on}, ${agree}.`;
}

// How many of a Volume's estimates its batch found, and what its survey
// read: "Found 12 of 30 in this Volume. Page numbers read on 9 Images,
// all agreeing."
export function volumeFoundWords(
  tries: VisionTry[],
  of: number,
  survey: Surveyed | null
) {
  const found = tries.filter((t) => matchAt(t) !== null).length;
  const what = found === 0 ? `Found none of ${of}` : `Found ${found} of ${of}`;
  const read = survey === null ? '' : ` ${surveyWords(survey)}`;
  return `${what} in this Volume.${read}`;
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
