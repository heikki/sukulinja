// The check's report, a line each: the Volumes re-scanned, each with its
// stale pins, hand ones first.

import type { StalePin } from '@/common/types';
import type { CheckResult } from '@/server/citation-scans/rescans';

const KINDS: Record<StalePin['kind'], string> = {
  page: 'Page pin',
  record: 'Record pin',
  reference: 'Reference pin',
  rejection: 'Rejection'
};

function pinned(s: StalePin) {
  if (s.pages !== undefined) {
    return s.pages.length === 1
      ? `page ${s.pages[0]}`
      : `pages ${s.pages.join('–')}`;
  }
  return s.record === undefined ? (s.url ?? '') : `record ${s.record}`;
}

function handFirst(a: StalePin, b: StalePin) {
  if (a.by === b.by) return a.image - b.image;
  return a.by === 'hand' ? -1 : 1;
}

export function reportLines(result: CheckResult) {
  const head = `${result.volumes} pinned Volumes checked; ${result.rescanned.length} re-scanned.`;
  const unchecked =
    result.unchecked === 0
      ? []
      : [`${result.unchecked} pins on an Image have no file id to check.`];
  const volumes = result.rescanned.flatMap((r) => [
    '',
    `${r.title} (${r.volumeId}): ${r.cached} → ${r.images} Images`,
    ...r.stale
      .toSorted(handFirst)
      .map(
        (s) =>
          `  ${s.from} ${KINDS[s.kind]} by ${s.by}, was Image ${s.image}: ${pinned(s)}`
      )
  ]);
  return [head, ...unchecked, ...volumes];
}
