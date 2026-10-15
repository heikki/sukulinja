import { expect, test } from 'bun:test';

import type { Scan } from '@common/types';

import { clampImage, imageUrl, markOffer } from './helpers';

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

test('offers to mark what the link is not sure of', () => {
  const link: Scan = {
    volumeId: 'v1',
    volume: 'I Aa:5',
    image: 18,
    url: '',
    method: 'estimated'
  };
  const linked = new Set(['v1']);
  const at18 = { volumeId: 'v1', image: 18 };
  expect(markOffer(link, at18, true, linked)).toBe('anchor');
  expect(markOffer({ ...link, method: 'anchored' }, at18, true, linked)).toBe(
    'linked'
  );
  expect(markOffer({ ...link, method: 'placed' }, at18, true, null)).toBe(
    'linked'
  );
  const at19 = { volumeId: 'v1', image: 19 };
  expect(markOffer({ ...link, method: 'anchored' }, at19, true, linked)).toBe(
    'anchor'
  );
  expect(markOffer(link, at19, false, linked)).toBe('placement');
  expect(markOffer(link, { volumeId: 'v2', image: 3 }, true, linked)).toBe(
    'placement'
  );
  expect(markOffer(link, at19, true, null)).toBe('unknown');
});
