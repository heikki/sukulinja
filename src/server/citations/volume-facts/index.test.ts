import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openVolumeFacts } from '.';
import { juvaAstia } from '../astia/test-parish';
import { OLD_FILMING } from '../images';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'volume-facts-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function three(said: string) {
  return [said, said, said];
}

const AT = { volumeId: 'juva-1', volume: 'I Aa:1', image: 5 };

// Every change to the Volume's page numbers: why each is refused, or null.
async function changes(
  facts: ReturnType<typeof openVolumeFacts>
): Promise<Array<string | null>> {
  const surveyed = await facts.survey(
    AT.volumeId,
    AT.volume,
    async () => await Promise.resolve({ readings: [] })
  );
  return [
    (await facts.setImagePage(AT, [12]))?.rejected ?? null,
    (await facts.clearPages(AT.volumeId))?.rejected ?? null,
    'rejected' in surveyed ? surveyed.rejected : null
  ];
}

test("a mark locks the Volume's page numbers, each mark saying why, until unmarked", async () => {
  const facts = openVolumeFacts(dir, { astia: juvaAstia() });
  expect(await changes(facts)).toEqual([null, null, null]);
  await facts.mark(AT.volumeId, 'checked');
  expect(await changes(facts)).toEqual(
    three(
      'The page numbers of this Volume are marked checked. Unmark them to change them.'
    )
  );
  await facts.mark(AT.volumeId, 'none');
  expect(await changes(facts)).toEqual(
    three(
      'This Volume is marked as having no page numbers. Unmark it to change them.'
    )
  );
  await facts.mark(AT.volumeId, null);
  expect(await changes(facts)).toEqual([null, null, null]);
});

test('on a filming Astia has replaced, nothing changes them, marked or not', async () => {
  const astia = juvaAstia();
  const facts = openVolumeFacts(dir, { astia });
  await facts.mark(AT.volumeId, 'checked');
  await astia.volumeImages(AT.volumeId);
  astia.rescan(AT.volumeId, 20);
  await astia.peekImages(AT.volumeId);
  expect(await changes(facts)).toEqual(three(OLD_FILMING));
});

test("what's known of the numbering: counted, read, then its mark", async () => {
  const facts = openVolumeFacts(dir, { astia: juvaAstia() });
  expect(await facts.numbering(AT.volumeId)).toBe('counted');
  await facts.setImagePage(AT, [12]);
  expect(await facts.numbering(AT.volumeId)).toBe('read');
  await facts.mark(AT.volumeId, 'none');
  expect(await facts.numbering(AT.volumeId)).toBe('none');
  const pages = await facts.pagesOn(AT.volumeId, AT.volume);
  expect(pages.every((p) => p.pages.length === 0 && p.by === null)).toBe(true);
});
