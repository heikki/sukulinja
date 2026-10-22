import { expect, test } from 'bun:test';

import type { Box, LinkTarget, Unlinked } from '@/common/types';

import {
  linkLabel,
  missingText,
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
  certainty: 'match'
};
const VOLUME: LinkTarget = { precision: 'volume', certainty: 'estimated' };

test('names a Link by who says so, then how far down', () => {
  expect(linkLabel(marked(7, BOX))).toBe('Marked');
  expect(linkLabel(marked(7))).toBe('Marked Image');
  expect(linkLabel({ precision: 'volume', certainty: 'marked' })).toBe(
    'Marked Volume'
  );
  expect(linkLabel(VISION)).toBe('Match');
  expect(linkLabel(estimated(7, 'pins'))).toBe('Estimated Image');
  expect(linkLabel(VOLUME)).toBe('Estimated Volume');
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

test('says what is missing by parish, Book and years, when it can', () => {
  const baptisms = {
    parish: 'Mikkeli',
    kind: 'kastetut' as const,
    years: { from: 1779, to: 1779 }
  };
  expect(missingText('no-volume', baptisms)).toBe(
    'Mikkeli has no baptism Volume for 1779.'
  );
  const marriages = {
    parish: 'Kangasniemi',
    kind: 'vihityt' as const,
    years: { from: 1777, to: 1780 }
  };
  expect(missingText('not-digitized', marriages)).toBe(
    "Kangasniemi's marriage Volume for 1777–1780 isn't digitized in Astia."
  );
  expect(missingText('no-volume', null)).toBe(unlinkedHint('no-volume'));
  expect(missingText('no-volume', { ...baptisms, years: null })).toBe(
    unlinkedHint('no-volume')
  );
});
