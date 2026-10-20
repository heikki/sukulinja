import { expect, test } from 'bun:test';

import type { Box, LinkTarget, Unlinked } from '@common/types';

import {
  linkHint,
  linkLabel,
  unlinkedHint,
  unlinkedLabel,
  volumeTitle
} from './link-labels';

const BOX: Box = { left: 0, top: 0.5, width: 1, height: 0.05 };

function marked(image: number, box?: Box): LinkTarget {
  return box === undefined
    ? { precision: 'image', image, certainty: 'marked' }
    : { precision: 'entry', image, box, certainty: 'marked' };
}

function estimated(image: number, from: 'pins' | 'numbering'): LinkTarget {
  return { precision: 'image', image, certainty: 'estimated', from };
}

const VISION: LinkTarget = {
  precision: 'entry',
  image: 7,
  box: BOX,
  certainty: 'vision'
};
const VOLUME: LinkTarget = { precision: 'volume', certainty: 'estimated' };

test('names a Link by who says so, then how far down', () => {
  expect(linkLabel(marked(7, BOX))).toBe('Marked');
  expect(linkLabel(marked(7))).toBe('Marked Image');
  expect(linkLabel({ precision: 'volume', certainty: 'marked' })).toBe(
    'Marked Volume'
  );
  expect(linkLabel(VISION)).toBe('Vision match');
  expect(linkLabel(estimated(7, 'pins'))).toBe('Estimated Image');
  expect(linkLabel(VOLUME)).toBe('Estimated Volume');
  expect(linkHint(marked(7))).toMatch(/where on it isn't marked\.$/);
  expect(linkHint(estimated(7, 'pins'))).toMatch(/^Counted from page numbers/);
  expect(linkHint(estimated(7, 'numbering'))).toMatch(
    /^Guessed from the usual pages/
  );
  expect(linkHint(VOLUME)).toMatch(/may be the wrong one/);
});

test('says why a reference has no Link: not looked for, not found, or Astia failed', () => {
  const reasons: Unlinked[] = [
    'unparsed',
    'no-archive',
    'no-volume',
    'not-digitized',
    'no-images',
    'astia-error'
  ];
  expect(reasons.map((r) => [r, unlinkedLabel(r)])).toEqual([
    ['unparsed', 'No scan'],
    ['no-archive', 'No scan'],
    ['no-volume', 'Not found'],
    ['not-digitized', 'Not found'],
    ['no-images', 'Not found'],
    ['astia-error', 'Astia error']
  ]);
  expect(new Set(reasons.map((r) => unlinkedHint(r))).size).toBe(6);
  expect(unlinkedHint('astia-error')).toMatch(/again to retry\.$/);
});

test('names a Volume without its archive code', () => {
  expect(volumeTitle('I Aa:8 Pää- ja rippikirjat (1783-1790)')).toBe(
    'Pää- ja rippikirjat (1783-1790)'
  );
  expect(
    volumeTitle(
      'I Aa:15 Pää- ja rippikirjat, I Armisvesi - Pieksämäki (1827-1837)'
    )
  ).toBe('Pää- ja rippikirjat, I Armisvesi - Pieksämäki (1827-1837)');
  expect(
    volumeTitle('I C:4 Syntyneiden ja kastettujen luettelot (1744-1766)')
  ).toBe('Syntyneiden ja kastettujen luettelot (1744-1766)');
});
