import { expect, test } from 'bun:test';

import { memoryAstia } from './astia/memory-astia';
import { memoryParishes } from './astia/parishes';
import { routeParishes } from './parish-routes';

const ASTIA = memoryAstia({
  10: { title: 'Puumalan seurakunnan arkisto', volumes: [] },
  11: { title: 'Puumalan kunnan arkisto', volumes: [] }
});

function send(
  sources: Parameters<typeof routeParishes>[0],
  method: string,
  path: string,
  body?: unknown
) {
  const req = new Request(`http://app${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return routeParishes(sources, req, new URL(req.url).pathname);
}

test("a parish's archive is found, and a spelling linked into it", async () => {
  const sources = { astia: ASTIA, parishes: memoryParishes([]) };
  const found = await send(sources, 'GET', '/parishes/search?q=Puumala');
  expect(await found!.json()).toEqual([
    { archiveId: '10', title: 'Puumalan seurakunnan arkisto' }
  ]);

  const linked = await send(sources, 'POST', '/parishes/spellings', {
    spelling: 'Puumala',
    archiveId: '10'
  });
  expect(linked!.status).toBe(204);
  expect(sources.parishes.archiveOf('Puumala')).toBe('10');
  const listed = await send(sources, 'GET', '/parishes');
  expect(await listed!.json()).toEqual([
    { archiveId: '10', title: 'Puumalan seurakunnan arkisto' }
  ]);
});

test("only a parish's archive can be chosen", async () => {
  const sources = { astia: ASTIA, parishes: memoryParishes([]) };
  const added = await send(sources, 'POST', '/parishes', { archiveId: '11' });
  expect(added!.status).toBe(400);
  expect(await added!.text()).toBe(
    "Puumalan kunnan arkisto isn't a parish's archive."
  );
  const noSpelling = await send(sources, 'POST', '/parishes/spellings', {
    archiveId: '10'
  });
  expect(noSpelling!.status).toBe(400);
  expect(sources.parishes.all()).toEqual([]);

  const ok = await send(sources, 'POST', '/parishes', { archiveId: '10' });
  expect(ok!.status).toBe(204);
  expect(sources.parishes.all()).toEqual([{ archiveId: '10', spellings: [] }]);
  expect(await send(sources, 'GET', '/elsewhere')).toBeNull();
});
