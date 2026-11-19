// Which Volumes an Expected entry may be in: of its kind of Book, in the
// parishes its places name or, failing those, the person's other ones,
// covering its years.

import type { ExpectedEntry, SuggestedVolume, Years } from '@/common/types';

import type { Volume } from '../astia/astia';

// The parish archives an Expected entry is looked for in: those its own
// Facts' places name (`near`), then the person's others.
export interface WhereToLook {
  near: string[];
  others: string[];
}

function overlaps(a: Years, b: Years) {
  return a.from <= b.to && b.from <= a.to;
}

// Whether the Volume holds any of the years: by the ranges it holds when
// its span has gaps.
export function covers(volume: Volume, years: Years) {
  if (volume.years === null) return false;
  const ranges = volume.parts.length > 0 ? volume.parts : [volume.years];
  return ranges.some((r) => overlaps(r, years));
}

// The archives to look in: the near ones; failing those, the person's
// others. A life and a childhood are looked for in both, as people moved.
export function archivesFor(expected: ExpectedEntry, where: WhereToLook) {
  const others = where.others.filter((a) => !where.near.includes(a));
  const roams = expected.of === 'life' || expected.of === 'childhood';
  const near = where.near.map((archiveId) => ({ archiveId, near: true }));
  const far = others.map((archiveId) => ({ archiveId, near: false }));
  if (near.length === 0) return far;
  return roams ? [...near, ...far] : near;
}

// The archive's digitized Volumes of the Expected entry's kind covering
// its years, by years.
export function fitting(
  expected: ExpectedEntry,
  volumes: Volume[],
  archive: { archiveId: string; title: string; near: boolean }
): SuggestedVolume[] {
  return volumes
    .filter(
      (v) =>
        v.digitized && v.kind === expected.kind && covers(v, expected.years)
    )
    .toSorted((a, b) => (a.years?.from ?? 0) - (b.years?.from ?? 0))
    .map((v) => ({
      id: v.id,
      label: v.label,
      years: v.years,
      archiveId: archive.archiveId,
      archive: archive.title,
      near: archive.near
    }));
}
