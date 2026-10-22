import type { LinkOpen, PendingLink } from '@client/state';
import type { VolumeCitation } from '@common/types';

// The Images beside `n` that exist, the one ahead of `step` first.
export function neighbours(n: number, count: number | null, step: 1 | -1) {
  const beside = [n + step, n - step];
  return beside.filter((i) => i >= 1 && (count === null || i <= count));
}

// The Volume's rows to box on the scan: all but the source's own while its
// own Box is pending, which takes its place; a new Citation's doesn't.
export function rowsShown(
  rows: VolumeCitation[] | null | 'failed',
  source: LinkOpen,
  pending: PendingLink | null
) {
  const editing = pending !== null && pending.cite === undefined;
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => !editing || r.citation.id !== source.citation.id
  );
}
