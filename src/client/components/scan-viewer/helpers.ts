import type { LinkOpen, PendingChange } from '@/client/state';
import type { VolumeCitation } from '@/common/types';

// The Volume's rows to box on the scan: all but those whose Box the
// pending change replaces, as its own Box takes their place. A Mark moves
// the source's Box, shared by everyone citing its record; an edited Entry
// moves the Box of everyone in it; a new Entry replaces none.
export function rowsShown(
  rows: VolumeCitation[] | null | 'failed',
  source: LinkOpen | null,
  pending: PendingChange | null
) {
  const replaced = replacedBy(pending, source);
  return (Array.isArray(rows) ? rows : []).filter((r) => !replaced(r));
}

function replacedBy(
  pending: PendingChange | null,
  source: LinkOpen | null
): (row: VolumeCitation) => boolean {
  const marks = pending?.kind === 'mark' || pending?.kind === 'place';
  if (marks && source !== null) {
    const { markKey } = source.citation;
    return (r) => r.citation.markKey === markKey;
  }
  if (pending?.kind === 'edit') {
    const ids = new Set(pending.editing.was.map((p) => p.citationId));
    return (r) => ids.has(r.citation.id);
  }
  return () => false;
}
