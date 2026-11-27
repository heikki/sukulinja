import { describe, expect, test } from 'bun:test';

import type { DownloadStatus, VolumeOnDisk } from '@/common/types';

import { stepsOf } from './steps';
import type { FolderState } from './steps';

const PART = { images: 180, cached: 42, bytes: 42_000 };
const WHOLE = { images: 4, cached: 4, bytes: 4000 };
// Its Images only in the Offload folder.
const IN_FOLDER = { images: 4, cached: 4, bytes: 0 };
const NONE = { images: 4, cached: 0, bytes: 0 };
const OFFLOADED = { images: 3, bytes: 3000 };

function steps(
  onDisk: VolumeOnDisk,
  folder: FolderState,
  {
    digitized = true,
    download = null,
    offloaded = null
  }: {
    digitized?: boolean;
    download?: Partial<DownloadStatus> | null;
    offloaded?: { images: number; bytes: number } | null;
  } = {}
) {
  return stepsOf(
    {
      digitized,
      onDisk,
      download:
        download === null
          ? null
          : { volumeId: '1', state: 'stopped', error: null, ...download },
      offloaded
    },
    folder
  );
}

describe('the download', () => {
  test('is started until the Volume is whole here', () => {
    expect(steps(NONE, 'none').move).toBe('start');
    expect(steps(PART, 'none', { download: {} }).move).toBe('start');
    expect(steps(WHOLE, 'none').move).toBeNull();
    expect(steps(IN_FOLDER, 'attached').move).toBeNull();
  });

  test('is stopped while it downloads or waits to', () => {
    expect(steps(PART, 'none', { download: { state: 'queued' } }).move).toBe(
      'stop'
    );
    const downloading = { download: { state: 'downloading' as const } };
    expect(steps(PART, 'away', downloading).move).toBe('stop');
  });

  test("isn't offered for a Volume with no scans", () => {
    expect(steps(NONE, 'none', { digitized: false }).move).toBeNull();
  });

  test("isn't offered for a Volume Astia has re-scanned", () => {
    const rescanned = { download: { error: 'rescanned' as const } };
    expect(steps(PART, 'none', rescanned).move).toBeNull();
  });

  test('brings an Offloaded one back first, which waits for the folder', () => {
    expect(steps(IN_FOLDER, 'attached', { offloaded: OFFLOADED }).move).toBe(
      'bringBack'
    );
    expect(steps(PART, 'away', { offloaded: OFFLOADED }).move).toBeNull();
    // The folder since cleared, the rest is fetched from Astia.
    expect(steps(PART, 'none', { offloaded: OFFLOADED }).move).toBe('start');
  });
});

describe('offloading', () => {
  test("takes the download's place once a Volume is whole, with the folder attached", () => {
    expect(steps(WHOLE, 'attached').move).toBe('offload');
    expect(steps(WHOLE, 'none').move).toBeNull();
    expect(steps(WHOLE, 'away').move).toBeNull();
    expect(steps(PART, 'attached').move).toBe('start');
    expect(steps(IN_FOLDER, 'attached').move).toBeNull();
  });
});

describe('the trash step', () => {
  test('removes whatever of it is here, Offloaded, whole or not', () => {
    expect(steps(WHOLE, 'attached').trash).toBe('remove');
    expect(steps(WHOLE, 'none').trash).toBe('remove');
    expect(steps(PART, 'attached').trash).toBe('remove');
    expect(steps(PART, 'none').trash).toBe('remove');
    expect(steps(PART, 'attached', { offloaded: OFFLOADED }).trash).toBe(
      'remove'
    );
    expect(steps(IN_FOLDER, 'attached').trash).toBe('remove');
    // With the folder since cleared, what it kept is removed from disk.
    expect(steps(PART, 'none', { offloaded: OFFLOADED }).trash).toBe('remove');
  });

  test('offers nothing the folder being away would refuse', () => {
    expect(steps(PART, 'away').trash).toBeNull();
    expect(steps(PART, 'away', { offloaded: OFFLOADED }).trash).toBeNull();
  });

  test('has none with nothing here', () => {
    expect(steps(NONE, 'none').trash).toBeNull();
    expect(steps(NONE, 'attached').trash).toBeNull();
  });
});
