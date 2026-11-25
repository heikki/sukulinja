// What the Scan viewer or the Photo viewer was left open on, in a dataset,
// so entering it again opens them as they were (ADR-0036). Kept in a
// cookie, one per dataset, for the reason appearance.ts gives.

import { currentSlug } from '@/client/current-slug';
import { goTo } from '@/client/on';
import type { AppState } from '@/client/state';
import type { ChangeOn } from '@/common/types';

const COOKIE_PREFIX = 'sl-viewer-';
const YEAR_S = 365 * 24 * 60 * 60;

// With whom selected it was open, which entering the dataset must select
// again for it to open: a source of theirs, on its Link or looking for
// one; an Image, as one moved off a Link to is; or a Photo.
export type ViewerKept = { personId: number } & (
  | { kind: 'citation'; citationId: number }
  | { kind: 'image'; volumeId: string; volume: string; image: number }
  | { kind: 'photo'; photoId: number }
);

function cookieName(slug: string | null) {
  return slug === null ? null : `${COOKIE_PREFIX}${slug}`;
}

function isKept(v: unknown): v is ViewerKept {
  if (typeof v !== 'object' || v === null) return false;
  const k = v as Record<string, unknown>;
  function num(key: string) {
    return typeof k[key] === 'number';
  }
  if (!num('personId')) return false;
  if (k.kind === 'citation') return num('citationId');
  if (k.kind === 'photo') return num('photoId');
  return (
    k.kind === 'image' &&
    typeof k.volumeId === 'string' &&
    typeof k.volume === 'string' &&
    num('image')
  );
}

// What the viewers show now; null with both closed, or with no one
// selected.
export function viewerNow(state: AppState): ViewerKept | null {
  const personId = state.selected.id.get();
  if (personId === null) return null;
  const photo = state.photoViewer.opened.get();
  if (photo !== null) return { personId, kind: 'photo', photoId: photo.id };
  const { viewer } = state;
  if (viewer.opened.get() === null) return null;
  const source = viewer.source.get();
  if (source !== null && !viewer.away.get()) {
    return { personId, kind: 'citation', citationId: source.citation.id };
  }
  const volume = viewer.volume.get();
  if (volume === null) return null;
  return {
    personId,
    kind: 'image',
    volumeId: volume.id,
    volume: volume.label,
    image: viewer.image.get()
  };
}

function keptViewer(): ViewerKept | null {
  const name = cookieName(currentSlug());
  if (name === null) return null;
  const prefix = `${name}=`;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
  if (raw === undefined || raw === '') return null;
  try {
    const kept: unknown = JSON.parse(decodeURIComponent(raw));
    return isKept(kept) ? kept : null;
  } catch {
    return null;
  }
}

// The cookie last written, so it's written only when it changes.
let written: string | null = null;

function keepViewer(kept: ViewerKept | null) {
  const name = cookieName(currentSlug());
  if (name === null) return;
  const value = kept === null ? '' : JSON.stringify(kept);
  if (`${name}=${value}` === written) return;
  written = `${name}=${value}`;
  document.cookie =
    kept === null
      ? `${name}=; path=/; max-age=0; samesite=lax`
      : `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR_S}; samesite=lax`;
}

// Forgotten with its dataset, so another of the same name doesn't open
// it.
export function forgetViewer(slug: string) {
  document.cookie = `${COOKIE_PREFIX}${slug}=; path=/; max-age=0; samesite=lax`;
}

// Where to go to open it again, as a Change goes to what it's on.
function keptOn(kept: ViewerKept): ChangeOn {
  if (kept.kind === 'citation') {
    return { ...kept, source: null, reference: null };
  }
  if (kept.kind === 'image') {
    const { volumeId, volume, image } = kept;
    return {
      kind: 'image',
      volumeId,
      volume,
      image,
      fileId: '',
      stale: false,
      personId: null
    };
  }
  return kept;
}

// Kept as the viewers and the selection change: by the viewers as they
// move, and by the chart on each update. Once the chart is first drawn,
// what was kept opens again, if the person it was open with is the one
// selected; until it has, it isn't forgotten.
export class ViewerMemory {
  private reopened = false;
  private reopening = false;

  // Each time the viewers show something new.
  static viewerMoved(state: AppState) {
    const now = viewerNow(state);
    if (now !== null) keepViewer(now);
  }

  chartDrawn(state: AppState) {
    if (!this.reopened) {
      this.reopened = true;
      const kept = keptViewer();
      if (kept === null) return;
      if (kept.personId !== state.selected.id.get()) {
        keepViewer(null);
        return;
      }
      this.reopening = true;
      goTo(state, keptOn(kept));
      return;
    }
    const open =
      state.viewer.opened.get() !== null ||
      state.photoViewer.opened.get() !== null;
    if (open) this.reopening = false;
    if (open || !this.reopening) keepViewer(viewerNow(state));
  }
}
