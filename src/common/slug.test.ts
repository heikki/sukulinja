import { describe, expect, test } from 'bun:test';

import { slugFromFilename } from './slug';

describe('slugFromFilename', () => {
  test('drops a .ged or .gedcom extension', () => {
    expect(slugFromFilename('Family.ged')).toBe('family');
    expect(slugFromFilename('Tree.GEDCOM')).toBe('tree');
  });

  test('transliterates diacritics instead of replacing them with dashes', () => {
    expect(slugFromFilename('Hämeenlinna')).toBe('hameenlinna');
    expect(slugFromFilename('Töölö')).toBe('toolo');
    expect(slugFromFilename('Åland')).toBe('aland');
  });

  test('collapses other punctuation to single dashes and trims the ends', () => {
    expect(slugFromFilename('  My Family! ')).toBe('my-family');
  });
});
