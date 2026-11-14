// What tests of the key use: the file's tests run with none of the
// environment's credentials set, whatever the shell running them has.

import { afterEach, beforeEach } from 'bun:test';

import { ENVIRONMENT_KEYS } from './key-routes';

export function withoutEnvironmentKeys() {
  const saved = new Map<string, string | undefined>();
  beforeEach(() => {
    for (const n of ENVIRONMENT_KEYS) {
      saved.set(n, process.env[n]);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- an unset variable is what's tested
      delete process.env[n];
    }
  });
  afterEach(() => {
    for (const n of ENVIRONMENT_KEYS) {
      const v = saved.get(n);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- put back as it was
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
  });
}
