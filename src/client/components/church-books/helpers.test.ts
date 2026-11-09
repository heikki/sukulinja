import { describe, expect, test } from 'bun:test';

import type { ChurchBookVolume, DownloadStatus } from '@/common/types';

import { busy, diskLine, downloadActions } from './helpers';

const MB = 1024 ** 2;

function volume(
  download: Partial<DownloadStatus> | null,
  onDisk = { images: 180, cached: 0, bytes: 0 },
  digitized = true
): ChurchBookVolume {
  return {
    id: '1',
    label: 'I Ab:5 Pää- ja rippikirjat (1790-1796)',
    digitized,
    onDisk,
    download:
      download === null
        ? null
        : {
            volumeId: '1',
            state: 'stopped',
            error: null,
            ...onDisk,
            ...download
          }
  };
}

function labels(v: ChurchBookVolume) {
  return downloadActions(v).map((a) => a.label);
}

describe('downloadActions', () => {
  test('offers each state what fits it', () => {
    expect(labels(volume(null))).toEqual(['Download']);
    expect(labels(volume({ state: 'queued' }))).toEqual(['Stop']);
    expect(labels(volume({ state: 'downloading' }))).toEqual(['Stop']);
    expect(labels(volume({ state: 'stopped' }))).toEqual(['Resume', 'Remove']);
    expect(labels(volume({ state: 'complete' }))).toEqual(['Remove']);
  });

  test('offers to keep a Volume viewed whole already', () => {
    const viewed = { images: 3, cached: 3, bytes: 3 * MB };
    expect(labels(volume(null, viewed))).toEqual(['Keep']);
    expect(diskLine(volume(null, viewed))).toBe('All on disk, not kept · 3 MB');
  });

  test('offers nothing for a Volume with no scans', () => {
    expect(labels(volume(null, undefined, false))).toEqual([]);
  });
});

describe('diskLine', () => {
  test('says what is on disk', () => {
    expect(diskLine(volume(null))).toBe('Not on disk');
    expect(
      diskLine(volume(null, { images: 180, cached: 3, bytes: 8 * MB }))
    ).toBe('3 of 180 Images on disk · 8 MB');
    expect(diskLine(volume(null, undefined, false))).toBe('Not digitized');
  });

  test('says where a download is, and why it stopped', () => {
    const at = { images: 180, cached: 42, bytes: 105 * MB };
    expect(diskLine(volume({ state: 'downloading' }, at))).toBe(
      'Downloading 42 of 180 · 105 MB'
    );
    expect(diskLine(volume({ state: 'queued' }, at))).toBe(
      'Waiting to download · 105 MB'
    );
    expect(diskLine(volume({ state: 'stopped' }, at))).toBe(
      'Stopped at 42 of 180 · 105 MB'
    );
    expect(
      diskLine(volume({ state: 'stopped', error: 'unreachable' }, at))
    ).toBe("Stopped at 42 of 180: Astia couldn't be reached · 105 MB");
    expect(diskLine(volume({ state: 'stopped', error: 'no-image' }, at))).toBe(
      'Stopped at 42 of 180: Astia gave no image · 105 MB'
    );
    expect(diskLine(volume({ state: 'complete' }, at))).toBe(
      'Downloaded · 105 MB'
    );
  });
});

test('busy while any is downloading or waiting to', () => {
  expect(busy([volume(null), volume({ state: 'complete' })])).toBe(false);
  expect(busy([volume(null), volume({ state: 'queued' })])).toBe(true);
});
