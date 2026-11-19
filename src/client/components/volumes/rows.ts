import type {
  ChurchBookVolume,
  InstalledBook,
  ListedBook,
  PageNumbering
} from '@/common/types';

// A Volume as both tables of the Volumes tab show it: what the Book list
// knows of it, how many of the dataset's Citations link into it and
// whether it was added by hand, and what All books knows, its page
// numbers and its offload; null for what the other list doesn't know.
export type VolumeRow = ChurchBookVolume & {
  archiveId: string | null;
  archive: string | null;
  cited: number | null;
  added: boolean;
  pages: PageNumbering | null;
  offloaded: InstalledBook['offloaded'];
};

// The Book list's Volumes, with what All books knows of each.
export function treeRows(
  listed: ListedBook[],
  installed: InstalledBook[]
): VolumeRow[] {
  const byId = new Map(installed.map((b) => [b.id, b]));
  return listed.map((b) => ({
    ...b,
    pages: byId.get(b.id)?.pages ?? null,
    offloaded: byId.get(b.id)?.offloaded ?? null
  }));
}

// Every Volume on this computer, with what the Book list knows of each.
export function allRows(
  installed: InstalledBook[],
  listed: ListedBook[]
): VolumeRow[] {
  const byId = new Map(listed.map((b) => [b.id, b]));
  return installed.map((b) => ({
    ...b,
    cited: byId.get(b.id)?.cited ?? null,
    added: byId.get(b.id)?.added ?? false
  }));
}

// Whether this computer has a Volume the Book list leaves out: only then
// is there more to all of them than the tree's.
export function hasOthers(listed: ListedBook[], installed: InstalledBook[]) {
  const ids = new Set(listed.map((b) => b.id));
  return installed.some((b) => !ids.has(b.id));
}
