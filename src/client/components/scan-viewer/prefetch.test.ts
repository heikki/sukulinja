import { expect, test } from 'bun:test';

import { Prefetch } from './prefetch';

// Requests that settle when the test says.
function fakeLoader() {
  const asked: string[] = [];
  const aborted: string[] = [];
  const settle = new Map<string, () => void>();
  function loader(url: string, signal: AbortSignal) {
    asked.push(url);
    signal.addEventListener('abort', () => {
      aborted.push(url);
    });
    const done = Promise.withResolvers<undefined>();
    settle.set(url, () => {
      done.resolve(undefined);
    });
    return done.promise;
  }
  async function finish(url: string) {
    settle.get(url)!();
    await Bun.sleep(0);
  }
  return { asked, aborted, finish, prefetch: new Prefetch(loader) };
}

test('loads one at a time, in order, and each once', async () => {
  const { asked, finish, prefetch } = fakeLoader();
  prefetch.want(['/i/6', '/i/4']);
  expect(asked).toEqual(['/i/6']);
  await finish('/i/6');
  expect(asked).toEqual(['/i/6', '/i/4']);
  await finish('/i/4');
  prefetch.want(['/i/6', '/i/4']);
  expect(asked).toEqual(['/i/6', '/i/4']);
});

test('stepping on drops the one no longer beside it', async () => {
  const { asked, aborted, finish, prefetch } = fakeLoader();
  prefetch.want(['/i/6', '/i/4']);
  prefetch.keep(['/i/6', '/i/5', '/i/7']);
  expect(aborted).toEqual([]);
  await finish('/i/6');
  expect(asked).toEqual(['/i/6']);
  prefetch.want(['/i/8', '/i/6']);
  prefetch.keep(['/i/9', '/i/8', '/i/10']);
  prefetch.keep(['/i/10', '/i/9', '/i/11']);
  expect(aborted).toEqual(['/i/8']);
});
