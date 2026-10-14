import { expect, test } from 'bun:test';

import { volumeYears } from './astia';

test('reads a volume label into its span and parts', () => {
  expect(volumeYears('I Aa:5 Pää- ja rippikirjat (1790-1796)')).toEqual({
    years: { from: 1790, to: 1796 },
    parts: [{ from: 1790, to: 1796 }]
  });
  expect(
    volumeYears(
      'I Aa:3 Pää- ja rippikirjat, 1766-1771, 1788-1789 kylät Hankamäki-Orala (1766-1789)'
    )
  ).toEqual({
    years: { from: 1766, to: 1789 },
    parts: [
      { from: 1766, to: 1771 },
      { from: 1788, to: 1789 }
    ]
  });
  expect(volumeYears('Kirkkokurin alaisten luettelot, 1788')).toEqual({
    years: { from: 1788, to: 1788 },
    parts: [{ from: 1788, to: 1788 }]
  });
});
