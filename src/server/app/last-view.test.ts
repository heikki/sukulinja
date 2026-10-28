import { describe, expect, test } from 'bun:test';

import { lastViewRoute, reopenAt } from './last-view';

const base = 'http://127.0.0.1:4000';

function route() {
  const saved: string[] = [];
  const fetch = lastViewRoute(
    (view) => {
      saved.push(view);
    },
    async () => await Promise.resolve(new Response('app'))
  );
  return { saved, fetch };
}

function put(body: string) {
  return new Request(`${base}/last-view`, { method: 'PUT', body });
}

describe('lastViewRoute', () => {
  test('saves the page put to it, hash and all', async () => {
    const { saved, fetch } = route();
    const res = await fetch(put('/d/demo/#/person/7?pan=1,2&zoom=0.5'));
    expect(res.status).toBe(204);
    expect(saved).toEqual(['/d/demo/#/person/7?pan=1,2&zoom=0.5']);
  });

  test('turns away a page on another server', async () => {
    const { saved, fetch } = route();
    expect((await fetch(put('https://example.com/'))).status).toBe(400);
    expect(saved).toEqual([]);
  });

  test('passes every other request on', async () => {
    const { fetch } = route();
    const res = await fetch(new Request(`${base}/d/demo/`));
    expect(await res.text()).toBe('app');
  });
});

function current(slug: string) {
  return slug === 'demo';
}

describe('reopenAt', () => {
  test('opens the chooser when nothing is saved', () => {
    expect(reopenAt(null, current)).toBe('/');
  });

  test('opens a saved view of a current dataset, or the chooser', () => {
    expect(reopenAt('/d/demo/#/person/7', current)).toBe('/d/demo/#/person/7');
    expect(reopenAt('/', current)).toBe('/');
  });

  test('drops a view of a dataset that is gone or outdated', () => {
    expect(reopenAt('/d/renamed/#/person/7', current)).toBeNull();
  });
});
