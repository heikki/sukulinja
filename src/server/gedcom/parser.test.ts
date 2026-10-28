import { describe, expect, test } from 'bun:test';

import { parseGedcom } from './parser';

describe('@@ in values', () => {
  test('GEDCOM 5.5.1 doubles every @', () => {
    const [head, indi] = parseGedcom(
      '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 EMAIL a@@b.org\n1 FAMS @F1@\n'
    );
    expect(head!.tag).toBe('HEAD');
    expect(indi!.children.map((c) => c.value)).toEqual(['a@b.org', '@F1@']);
  });

  test('GEDCOM 7 doubles only an @ that starts a line', () => {
    const [, note] = parseGedcom(
      '0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @N1@ SNOTE @@home\n1 CONT @@work and a@@b\n'
    );
    expect(note!.value).toBe('@home\n@work and a@@b');
  });
});
