const MB = 1024 ** 2;
const GB = 1024 ** 3;

// A cache's size as Settings shows it: whole MB below a GB, then GB to one
// place, dropping a trailing .0.
export function formatBytes(bytes: number) {
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  return `${Number((bytes / GB).toFixed(1))} GB`;
}

// What a pick in the Scan cache row would remove from disk, to ask about
// first: all of it on Clear, and on a cap below the space used, what the
// cache drops to fit. Null when nothing would go.
export type ScanCacheDrop =
  | { kind: 'clear'; bytes: number }
  | { kind: 'cap'; cap: number; bytes: number };

export function clearDrop(used: number): ScanCacheDrop | null {
  return used > 0 ? { kind: 'clear', bytes: used } : null;
}

export function capDrop(used: number, cap: number): ScanCacheDrop | null {
  return used > cap ? { kind: 'cap', cap, bytes: used - cap } : null;
}
