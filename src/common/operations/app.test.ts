import { expect, test } from 'bun:test';

import { APP_OPERATIONS } from './app';

test('a key is trimmed, and an empty one refused', () => {
  const { read } = APP_OPERATIONS.setAssistantKey;
  expect(read({ key: ' sk-test ' })).toEqual({ key: 'sk-test' });
  expect(read({ key: '  ' })).toBeNull();
});

test('a spelling needs something in it, and an archive its digits', () => {
  const { read } = APP_OPERATIONS.linkSpelling;
  expect(read({ spelling: 'Puumala', archiveId: '10' })).toEqual({
    spelling: 'Puumala',
    archiveId: '10'
  });
  expect(read({ spelling: ' ', archiveId: '10' })).toBeNull();
  expect(read({ archiveId: '10' })).toBeNull();
  expect(read({ spelling: 'Puumala', archiveId: 'x' })).toBeNull();
});
