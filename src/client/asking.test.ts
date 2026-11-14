import { expect, test } from 'bun:test';

import type { ReactiveControllerHost } from 'lit';

import { Asking } from './asking';
import { ApiError } from './dataset-api';

// A host counting the updates it's asked for.
function host() {
  const counted = { updates: 0 };
  const h: ReactiveControllerHost = {
    addController: () => undefined,
    removeController: () => undefined,
    requestUpdate: () => {
      counted.updates += 1;
    },
    updateComplete: Promise.resolve(true)
  };
  return { h, counted };
}

async function refuse() {
  await Promise.resolve();
  throw new ApiError('Name someone in the entry.');
}

async function done() {
  await Promise.resolve();
}

test('one ask at a time, busy while it runs', async () => {
  const asking = new Asking(host().h);
  const held = Promise.withResolvers<undefined>();
  const first = asking.run(async () => {
    await held.promise;
  });
  expect(asking.busy).toBe(true);
  expect(await asking.run(done)).toBe(false);
  held.resolve(undefined);
  expect(await first).toBe(true);
  expect(asking.busy).toBe(false);
});

test("a refusal is kept in the app's words, until the next ask or forgotten", async () => {
  const { h, counted } = host();
  const asking = new Asking(h);
  expect(await asking.run(refuse)).toBe(false);
  expect(asking.refused).toBe('Name someone in the entry.');
  asking.forget();
  expect(asking.refused).toBeNull();
  await asking.run(refuse);
  await asking.run(done);
  expect(asking.refused).toBeNull();
  expect(counted.updates).toBeGreaterThan(0);
});

test('anything but a refusal is a bug, and goes on', async () => {
  const asking = new Asking(host().h);
  const bug = await asking
    .run(async () => {
      await Promise.resolve();
      throw new TypeError('bug');
    })
    .catch((err: unknown) => err);
  expect(bug).toBeInstanceOf(TypeError);
  expect(asking.busy).toBe(false);
});
