// Which pins on a Volume's Images were made on the filming Astia lists
// now. Resolution, saving and the Re-scan report all read pins through
// here.
//
// A pin on an Image keeps the Image's Astia file id, which tells the
// filming it was made on. After a Re-scan an Image number may hold another
// page, so a pin made on the filming replaced is stale: left out, with its
// Box, as if never saved, until the page or record is pinned again. A pin
// without an Image, or saved before pins kept file ids, can't be told, and
// is current.

import type { Astia } from '../astia/astia';
import type { Pins } from './types';

// A Volume's filming: its Images' file ids, in Image order.
export interface Filming {
  volumeId: string;
  files: string[];
}

interface OnImage {
  image?: number;
  fileId?: string;
}

interface Split<T> {
  current: T[];
  stale: T[];
}

// The filming of the Volume that Astia lists now.
export async function filmingOf(astia: Astia, volumeId: string) {
  const filming: Filming = {
    volumeId,
    files: await astia.volumeImages(volumeId)
  };
  return filming;
}

// The Astia file id of the filming's Image, to save with a pin on it.
export function fileOf(filming: Filming, image: number) {
  const fileId = filming.files[image - 1];
  return fileId === undefined ? {} : { fileId };
}

function madeOn(filming: Filming, pin: OnImage) {
  return (
    pin.image === undefined ||
    pin.fileId === undefined ||
    filming.files[pin.image - 1] === pin.fileId
  );
}

// Pins on the filming's Volume, by whether they were made on it.
export function split<T extends OnImage>(
  filming: Filming,
  pins: readonly T[]
): Split<T> {
  const out: Split<T> = { current: [], stale: [] };
  for (const pin of pins) {
    (madeOn(filming, pin) ? out.current : out.stale).push(pin);
  }
  return out;
}

// Whether the filming leaves out a pin naming its Volume: one made on
// another filming of the same Volume. A pin of another Volume it says
// nothing of.
export function leavesOut(
  filming: Filming,
  pin: OnImage & { volumeId: string }
) {
  return pin.volumeId === filming.volumeId && !madeOn(filming, pin);
}

// The Volume's own Page pins and Record pins, split.
export function splitVolume(filming: Filming, pins: Pins) {
  const own = pins.volumes[filming.volumeId];
  const pages = split(filming, own?.pages ?? []);
  const records = split(filming, own?.records ?? []);
  return {
    current: { pages: pages.current, records: records.current },
    stale: { pages: pages.stale, records: records.stale }
  };
}
