import { expect, test } from 'bun:test';

import type { CitationVolume, Scan } from '@common/types';

import {
  clampImage,
  groupVolumes,
  imageUrl,
  linkLabel,
  markOffer,
  neighbours
} from './helpers';

test('keeps an image number inside the Volume', () => {
  expect(clampImage(0, 354)).toBe(1);
  expect(clampImage(355, 354)).toBe(354);
  expect(clampImage(107.4, 354)).toBe(107);
  expect(clampImage(9999, null)).toBe(9999);
  expect(clampImage(-3, null)).toBe(1);
});

test('asks for an Image again on retry', () => {
  expect(imageUrl('1202439742', 18, 0)).toBe(
    '/astia/volumes/1202439742/images/18'
  );
  expect(imageUrl('1202439742', 18, 2)).toBe(
    '/astia/volumes/1202439742/images/18?retry=2'
  );
});

function volume(
  id: string,
  kind: CitationVolume['kind'],
  from: number,
  image: number | null = null
): CitationVolume {
  return {
    id,
    label: `Volume ${id}`,
    kind,
    years: { from, to: from + 9 },
    image
  };
}

test('offers to mark what the link is not sure of', () => {
  const link: Scan = {
    volumeId: 'v1',
    volume: 'I Aa:5',
    image: 18,
    url: '',
    method: 'estimated'
  };
  const volumes = [
    volume('v1', 'rippi', 1820, 18),
    volume('v2', 'lasten', 1820)
  ];
  const at18 = { volumeId: 'v1', image: 18 };
  expect(markOffer(link, at18, true, volumes)).toBe('anchor');
  expect(markOffer({ ...link, method: 'anchored' }, at18, true, volumes)).toBe(
    'linked'
  );
  const vision = { ...link, method: 'placed' as const, by: 'vision' as const };
  expect(markOffer(vision, at18, true, volumes)).toBe('linked');
  expect(markOffer({ ...link, method: 'placed' }, at18, true, null)).toBe(
    'linked'
  );
  const at19 = { volumeId: 'v1', image: 19 };
  expect(markOffer({ ...link, method: 'anchored' }, at19, true, volumes)).toBe(
    'anchor'
  );
  expect(markOffer(link, at19, false, volumes)).toBe('placement');
  expect(markOffer(link, { volumeId: 'v2', image: 3 }, true, volumes)).toBe(
    'placement'
  );
  expect(markOffer(link, at19, true, null)).toBe('unknown');
  expect(markOffer(null, { volumeId: 'v2', image: 1 }, true, volumes)).toBe(
    'placement'
  );
});

test('lists linked Volumes first, then by Book kind and years', () => {
  const groups = groupVolumes([
    volume('kaste', 'kastetut', 1791),
    volume('rippi2', 'rippi', 1837),
    volume('muu', null, 1800),
    { ...volume('muu-b', null, 0), years: null },
    { ...volume('muu-a', null, 0), years: null },
    volume('rippi1', 'rippi', 1821),
    volume('linked', 'rippi', 1849, 64),
    volume('lasten', 'lasten', 1820)
  ]);
  expect(groups.map((g) => [g.label, g.volumes.map((v) => v.id)])).toEqual([
    ['Linked by this reference', ['linked']],
    ['Pää- ja rippikirjat', ['rippi1', 'rippi2']],
    ['Lastenkirjat', ['lasten']],
    ['Syntyneiden ja kastettujen luettelot', ['kaste']],
    ['Other', ['muu', 'muu-a', 'muu-b']]
  ]);
});

test('prefetches the Image ahead first', () => {
  expect(neighbours(5, 10, 1)).toEqual([6, 4]);
  expect(neighbours(5, 10, -1)).toEqual([4, 6]);
  expect(neighbours(1, 10, 1)).toEqual([2]);
  expect(neighbours(10, 10, 1)).toEqual([9]);
  expect(neighbours(10, null, 1)).toEqual([11, 9]);
});

test('says a link was matched by the vision model', () => {
  const link: Scan = {
    volumeId: 'v1',
    volume: 'I Aa:5',
    image: 18,
    url: '',
    method: 'placed'
  };
  expect(linkLabel(link)).toBe('Verified link');
  expect(linkLabel({ ...link, by: 'vision' })).toBe('Vision match');
  expect(linkLabel({ ...link, method: 'anchored' })).toBe('Estimated link');
  expect(linkLabel({ ...link, method: 'volume' })).toBe('Volume only');
});
