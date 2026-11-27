import { html } from 'lit';

import type { PhotoRow } from '@/common/types';

import { faceHref } from '../tree-view/avatar-cache';

interface Urls {
  thumb: (path: string) => string;
  media: (path: string) => string;
}

// What a tile shows of `p`: the person's face where their Tag marks it,
// cropped from the photo as their portrait is, and the whole photo where
// they have no Tag on it or the face couldn't be cropped. Nothing while
// it's being cropped, rather than the whole photo jumping to the face.
function tileSrc(p: PhotoRow, personId: number, urls: Urls) {
  const box = p.people.find((x) => x.personId === personId)?.box ?? null;
  if (box === null) return urls.thumb(p.path);
  const face = faceHref(urls.media(p.path), box);
  if (face === 'failed') return urls.thumb(p.path);
  return face === 'cropping' ? null : face.cropped;
}

// The person's Photos, as thumbnails in the order linked. Clicking one
// opens it in the Photo viewer; the one it shows is marked, and clicking
// it again does nothing.
export function renderPhotos(
  photos: PhotoRow[],
  { personId, shown }: { personId: number; shown: number | null },
  { open, ...urls }: Urls & { open: (p: PhotoRow) => void }
) {
  return html`<div class="photos">
    ${photos.map((p, i) => {
      const src = tileSrc(p, personId, urls);
      return html`<button
        class="photo ${p.id === shown ? 'viewing' : ''}"
        aria-current=${p.id === shown ? 'true' : 'false'}
        aria-label=${`Photo ${i + 1}`}
        @click=${() => {
          open(p);
        }}
      >
        ${src === null ? '' : html`<img src=${src} alt="" draggable="false" />`}
      </button>`;
    })}
  </div>`;
}
