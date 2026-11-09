// A parish archive's church books as the app's server lists them, outside
// any dataset, and their downloads.

import type { ChurchBookVolume } from '@/common/types';

import type { DownloadAction } from './helpers';

async function json<T>(res: Response) {
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

// The parish archive's Volumes, with what of each is on disk.
export async function fetchVolumes(archiveId: string) {
  return await json<ChurchBookVolume[]>(
    await fetch(`/astia/archives/${archiveId}/volumes`)
  );
}

const SEND: Record<DownloadAction, { method: string; path: string }> = {
  start: { method: 'PUT', path: 'download' },
  stop: { method: 'POST', path: 'download/stop' }
};

// Starts or stops the Volume's download.
export async function sendDownload(volumeId: string, action: DownloadAction) {
  const { method, path } = SEND[action];
  const res = await fetch(`/astia/volumes/${volumeId}/${path}`, { method });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}
