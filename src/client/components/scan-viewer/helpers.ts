import type { LinkOpen, PendingChange } from '@/client/state';
import type { VolumeCitation } from '@/common/types';

// The Volume's rows to box on the scan: all but the source's own while its
// own Box is pending, which takes its place (a Mark); an Entry's doesn't.
export function rowsShown(
  rows: VolumeCitation[] | null | 'failed',
  source: LinkOpen | null,
  pending: PendingChange | null
) {
  const editing = pending?.kind === 'mark';
  return (Array.isArray(rows) ? rows : []).filter(
    (r) => !editing || r.citation.id !== source?.citation.id
  );
}
