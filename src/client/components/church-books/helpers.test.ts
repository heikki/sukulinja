import { describe, expect, test } from 'bun:test';

import type {
  ChurchBookVolume,
  DownloadStatus,
  VolumeOnDisk
} from '@/common/types';

import { busy, diskLine, downloadActions, volumeLine } from './helpers';

const MB = 1024 ** 2;

function volume(
  download: Partial<DownloadStatus> | null,
  onDisk: VolumeOnDisk = { images: 180, cached: 0, bytes: 0 },
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
        : { volumeId: '1', state: 'stopped', error: null, ...download }
  };
}

function labels(v: ChurchBookVolume) {
  return downloadActions(v).map((a) => a.label);
}

const PART = { images: 180, cached: 42, bytes: 105 * MB };
const WHOLE = { images: 3, cached: 3, bytes: 3 * MB };

describe('downloadActions', () => {
  test('offers Download until a Volume is whole on disk', () => {
    expect(labels(volume(null))).toEqual(['Download']);
    expect(labels(volume(null, PART))).toEqual(['Download']);
    expect(labels(volume({ state: 'stopped' }, PART))).toEqual(['Download']);
    expect(labels(volume(null, WHOLE))).toEqual([]);
  });

  test('offers Stop while one downloads or waits to', () => {
    expect(labels(volume({ state: 'queued' }))).toEqual(['Stop']);
    expect(labels(volume({ state: 'downloading' }, PART))).toEqual(['Stop']);
  });

  test('offers nothing for a Volume with no scans', () => {
    expect(labels(volume(null, undefined, false))).toEqual([]);
  });
});

describe('diskLine', () => {
  test('says what is on disk', () => {
    expect(diskLine(volume(null))).toBe('Not on disk');
    expect(diskLine(volume(null, PART))).toBe(
      '42 of 180 Images on disk · 105 MB'
    );
    expect(diskLine(volume(null, WHOLE))).toBe('On disk · 3 MB');
    expect(diskLine(volume(null, undefined, false))).toBe('Not digitized');
  });

  test('says where a download is, and why it stopped', () => {
    expect(diskLine(volume({ state: 'downloading' }, PART))).toBe(
      'Downloading 42 of 180 · 105 MB'
    );
    expect(diskLine(volume({ state: 'queued' }, PART))).toBe(
      'Waiting to download · 105 MB'
    );
    expect(diskLine(volume({ state: 'stopped' }, PART))).toBe(
      'Stopped at 42 of 180 · 105 MB'
    );
    expect(
      diskLine(volume({ state: 'stopped', error: 'unreachable' }, PART))
    ).toBe("Stopped at 42 of 180: Astia couldn't be reached · 105 MB");
    expect(
      diskLine(volume({ state: 'stopped', error: 'no-image' }, PART))
    ).toBe('Stopped at 42 of 180: Astia gave no image · 105 MB');
  });
});

test('volumeLine leads with the Citations linking into it', () => {
  expect(volumeLine(volume(null), 12)).toBe('12 citations · Not on disk');
  expect(volumeLine(volume(null), 1)).toBe('1 citation · Not on disk');
  expect(volumeLine(volume(null), 0)).toBe('Not on disk');
  expect(volumeLine(volume(null), null)).toBe('Not on disk');
});

test('busy while any is downloading or waiting to', () => {
  expect(busy([volume(null), volume({ state: 'stopped' })])).toBe(false);
  expect(busy([volume(null), volume({ state: 'queued' })])).toBe(true);
});
