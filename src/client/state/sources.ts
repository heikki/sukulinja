import {
  linkHint,
  linkLabel,
  unlinkedHint,
  unlinkedLabel
} from '@client/link-labels';
import type {
  CitationRow,
  Link,
  LinkResolution,
  UnlinkedResolution
} from '@common/types';

// A church-book source's Link, in brief: how sure it is, in the Scan
// viewer's words, or why there's none; the tooltip says more. Opening the
// source shows `link` in the Scan viewer, if there is one; without one,
// `browse` is set when its parish's Volumes can be looked through for it.
export interface LinkStatus {
  label: string;
  title: string;
  link: Link | null;
  browse: UnlinkedResolution | null;
}

// Links arrive after the panel renders; until then the status is pending. A
// Split reference opens on its first candidate; if that's an Estimated
// Volume, the label counts the other candidates (+2).
export function linkStatus(
  resolution: LinkResolution | undefined,
  pending: boolean
): LinkStatus {
  if (resolution === undefined) {
    const label = pending ? 'Finding scan…' : 'Scan unavailable';
    return { label, title: '', link: null, browse: null };
  }
  if ('unlinked' in resolution) {
    return {
      label: unlinkedLabel(resolution.unlinked),
      title: unlinkedHint(resolution.unlinked),
      link: null,
      browse: resolution.archive === undefined ? null : resolution
    };
  }
  const { links } = resolution;
  const [first] = links;
  if (first === undefined) {
    return { label: 'No scan', title: '', link: null, browse: null };
  }
  const others = links.length - 1;
  const counted =
    others > 0 &&
    first.precision === 'volume' &&
    first.certainty === 'estimated';
  return {
    label: counted ? `${linkLabel(first)} +${others}` : linkLabel(first),
    title: counted
      ? `${linkHint(first)}\nThe reference fits ${others + 1} Volumes; it opens on the first.`
      : linkHint(first),
    link: first,
    browse: null
  };
}

// A source as the panel lists it: a church book's with its link status,
// any other's with none.
export interface Source {
  citation: CitationRow;
  status: LinkStatus | null;
}

// Sources under one heading: an archive's, the church books' with no
// archive, or the others'. `linked` when some link a Volume. Named only
// when there's a church book among them.
export interface SourceGroup {
  label: string | null;
  sources: Source[];
  linked: boolean;
}

function firstLink(resolution: LinkResolution | undefined) {
  return resolution !== undefined && 'links' in resolution
    ? (resolution.links[0] ?? null)
    : null;
}

// The archive an Unlinked reference's parish books were looked through in.
function unlinkedArchive(resolution: LinkResolution | undefined) {
  return resolution !== undefined && 'unlinked' in resolution
    ? (resolution.archive ?? null)
    : null;
}

// The heading a source goes under: the archive of the Volume it links (a
// Split reference's first) or whose books it wasn't found in, else the
// church books' or the others'.
function headingFor(c: CitationRow, links: Map<number, LinkResolution>) {
  if (!c.churchBook) return { label: 'Other', link: null };
  const resolution = links.get(c.id);
  const link = firstLink(resolution);
  const archive = link?.archive ?? unlinkedArchive(resolution);
  return { label: archive ?? 'Church books', link };
}

// The sources by archive, in the order the server sends them (church books
// by year, the others last); a Volume's references together, by page, and
// those an archive's books lack after them. `pending` while the Links
// still stream.
export function groupSources(
  citations: CitationRow[],
  links: Map<number, LinkResolution>,
  pending: boolean
) {
  const groups = new Map<string, SourceGroup>();
  const volumeOrder = new Map<string, number>();
  const placeOf = new Map<number, [number, number]>();
  for (const c of citations) {
    const { label, link } = headingFor(c, links);
    const group = groups.get(label) ?? { label, sources: [], linked: false };
    const status = c.churchBook ? linkStatus(links.get(c.id), pending) : null;
    group.sources.push({ citation: c, status });
    group.linked ||= link !== null;
    groups.set(label, group);
    if (link === null) continue;
    if (!volumeOrder.has(link.volumeId)) {
      volumeOrder.set(link.volumeId, volumeOrder.size);
    }
    placeOf.set(c.id, [volumeOrder.get(link.volumeId)!, c.citedPage ?? 0]);
  }
  function byPlace(a: Source, b: Source) {
    const [va, pa] = placeOf.get(a.citation.id) ?? [Infinity, 0];
    const [vb, pb] = placeOf.get(b.citation.id) ?? [Infinity, 0];
    return va === vb ? pa - pb : va - vb;
  }
  const named = citations.some((c) => c.churchBook);
  return [...groups.values()].map((g) => ({
    ...g,
    label: named ? g.label : null,
    sources: g.linked ? g.sources.toSorted(byPlace) : g.sources
  }));
}
