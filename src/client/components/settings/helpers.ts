const MB = 1024 ** 2;
const GB = 1024 ** 3;

// A cache's size as Settings shows it: whole MB below a GB, then GB to one
// place, dropping a trailing .0.
export function formatBytes(bytes: number) {
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  return `${Number((bytes / GB).toFixed(1))} GB`;
}
