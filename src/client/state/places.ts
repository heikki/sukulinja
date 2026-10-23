import type { Box, Link, LinkResolution } from '@/common/types';

// Where the Scan viewer's Links and Images point, read from them.

// Image numbers run 1..count; before the count is known, only from 1.
export function clampImage(n: number, count: number | null) {
  const high = count ?? Infinity;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, high));
}

export function imageOf(link: Link) {
  return 'image' in link ? link.image : null;
}

// The Box of a Link or pending change, if it's on that Image.
export function boxOn(
  at: { volumeId: string; image?: number; box?: Box },
  on: { volumeId: string; image: number }
) {
  const here = at.volumeId === on.volumeId && at.image === on.image;
  return here ? (at.box ?? null) : null;
}

// The file id in an Image's address in Astia's viewer.
export function fileIdOf(url: string | undefined) {
  return url === undefined
    ? null
    : (/[?&]fileId=(?<id>[^&]+)/.exec(url)?.groups?.id ?? null);
}

// Of a reference's Links resolved again, the one in the Volume marked.
export function markedIn(resolved: LinkResolution, volumeId: string) {
  const links = 'links' in resolved ? resolved.links : [];
  return links.find((l) => l.volumeId === volumeId) ?? null;
}
