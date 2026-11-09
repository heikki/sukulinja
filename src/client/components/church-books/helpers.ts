import type {
  ChurchBookVolume,
  DownloadError,
  DownloadStatus
} from '@/common/types';

import { formatBytes } from '../settings/helpers';

export type DownloadAction = 'start' | 'stop' | 'remove';

// What can be done with a Volume's download, as each button says it.
export function downloadActions(
  volume: ChurchBookVolume
): Array<{ action: DownloadAction; label: string }> {
  const { download } = volume;
  if (download === null) {
    return volume.digitized ? [{ action: 'start', label: 'Download' }] : [];
  }
  switch (download.state) {
    case 'queued':
    case 'downloading':
      return [{ action: 'stop', label: 'Stop' }];
    case 'stopped':
      return [
        { action: 'start', label: 'Resume' },
        { action: 'remove', label: 'Remove' }
      ];
    case 'complete':
      return [{ action: 'remove', label: 'Remove' }];
  }
}

const WHY: Record<DownloadError, string> = {
  unreachable: "Astia couldn't be reached",
  rescanned: 'Astia has re-scanned it'
};

function ofImages(d: { cached: number; images: number | null }) {
  return d.images === null ? `${d.cached}` : `${d.cached} of ${d.images}`;
}

function stateLine(d: DownloadStatus) {
  switch (d.state) {
    case 'queued':
      return 'Waiting to download';
    case 'downloading':
      return `Downloading ${ofImages(d)}`;
    case 'complete':
      return 'Downloaded';
    case 'stopped': {
      const at = `Stopped at ${ofImages(d)}`;
      return d.error === null ? at : `${at}: ${WHY[d.error]}`;
    }
  }
}

// What of a Volume is on disk, in a line under its title.
export function diskLine(volume: ChurchBookVolume) {
  if (!volume.digitized) return 'Not digitized';
  const { download, onDisk } = volume;
  const size = onDisk.bytes > 0 ? ` · ${formatBytes(onDisk.bytes)}` : '';
  if (download !== null) return `${stateLine(download)}${size}`;
  if (onDisk.cached === 0) return 'Not on disk';
  return `${ofImages(onDisk)} Images on disk${size}`;
}

// Whether any of the Volumes is downloading or waiting to: then the list
// is asked for again until none is.
export function busy(volumes: ChurchBookVolume[]) {
  return volumes.some(
    (v) => v.download?.state === 'queued' || v.download?.state === 'downloading'
  );
}
