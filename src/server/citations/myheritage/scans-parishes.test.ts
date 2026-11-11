// A reference resolved in the archive its parish's spelling links into,
// once the app is told which that is.

import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryParishes } from '../astia/parishes';
import { JUVA, juvaAstia, rippiCitation } from '../astia/test-parish';
import { churchBookRefOf } from './record';
import { citing, scansOf } from './test-pins';

test('a spelling linked into its archive resolves there, and stamps anew', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scans-'));
  const cited = rippiCitation(5000, '1790 - 1796', 12);
  const db = citing([cited], join(dir, 'db.sqlite'));
  try {
    const parishes = memoryParishes([]);
    const scans = scansOf(dir, db, { astia: juvaAstia(), parishes });
    const ref = churchBookRefOf(cited.page, cited.text)!;
    expect(await scans.resolveRef(ref)).toEqual({ unlinked: 'no-archive' });
    const before = await scans.stamp();

    await parishes.link('Juva', JUVA);

    expect(await scans.stamp()).not.toBe(before);
    const resolved = await scans.resolveRef(ref);
    expect('links' in resolved && resolved.links[0]?.volumeId).toBe('juva-1');
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
