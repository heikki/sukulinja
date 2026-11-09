import type {
  ChurchBookVolume,
  DownloadError,
  DownloadStatus,
  VolumeOnDisk
} from '@/common/types';

import { formatBytes } from '../settings/helpers';

export type DownloadAction = 'start' | 'stop';

function whole(d: VolumeOnDisk) {
  return d.images !== null && d.images > 0 && d.cached === d.images;
}

// What can be done with a Volume's download, as its button says it: stop
// one on its way, or download one not yet whole on disk.
export function downloadActions(
  volume: ChurchBookVolume
): Array<{ action: DownloadAction; label: string }> {
  const state = volume.download?.state;
  if (state === 'queued' || state === 'downloading') {
    return [{ action: 'stop', label: 'Stop' }];
  }
  if (!volume.digitized || whole(volume.onDisk)) return [];
  return [{ action: 'start', label: 'Download' }];
}

const WHY: Record<DownloadError, string> = {
  'unreachable': "Astia couldn't be reached",
  'no-image': 'Astia gave no image',
  'rescanned': 'Astia has re-scanned it'
};

function ofImages(d: VolumeOnDisk) {
  return d.images === null ? `${d.cached}` : `${d.cached} of ${d.images}`;
}

// Where a download this run is, or why it stopped.
function downloadLine(download: DownloadStatus, onDisk: VolumeOnDisk) {
  switch (download.state) {
    case 'queued':
      return 'Waiting to download';
    case 'downloading':
      return `Downloading ${ofImages(onDisk)}`;
    case 'stopped': {
      const why = download.error === null ? '' : `: ${WHY[download.error]}`;
      return `Stopped at ${ofImages(onDisk)}${why}`;
    }
  }
}

// What of a Volume is on disk, and its download, in a line under its
// title.
export function diskLine(volume: ChurchBookVolume) {
  if (!volume.digitized) return 'Not digitized';
  const { download, onDisk } = volume;
  const size = onDisk.bytes > 0 ? ` · ${formatBytes(onDisk.bytes)}` : '';
  const going =
    download?.state === 'queued' || download?.state === 'downloading';
  if (whole(onDisk) && !going) return `On disk${size}`;
  if (download !== null) return `${downloadLine(download, onDisk)}${size}`;
  if (onDisk.cached === 0) return 'Not on disk';
  return `${ofImages(onDisk)} Images on disk${size}`;
}

// A Volume's line: how many of the dataset's Citations link into it, when
// known and any do, then what of it is on disk.
export function volumeLine(volume: ChurchBookVolume, cited: number | null) {
  const disk = diskLine(volume);
  if (cited === null || cited === 0) return disk;
  return `${cited === 1 ? '1 citation' : `${cited} citations`} · ${disk}`;
}

// Whether any of the Volumes is downloading or waiting to: then the list
// is asked for again until none is.
export function busy(volumes: ChurchBookVolume[]) {
  return volumes.some(
    (v) => v.download?.state === 'queued' || v.download?.state === 'downloading'
  );
}
