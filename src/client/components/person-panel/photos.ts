import { html } from 'lit';

import type { PhotoRow } from '@/common/types';

// The person's Photos, as thumbnails in the order linked. Clicking one
// opens it in the Photo viewer, and clicking the one it shows closes it;
// that one is marked.
export function renderPhotos(
  photos: PhotoRow[],
  shown: number | null,
  { url, open }: { url: (path: string) => string; open: (p: PhotoRow) => void }
) {
  return html`<div class="photos">
    ${photos.map(
      (p, i) =>
        html`<button
          class="photo ${p.id === shown ? 'viewing' : ''}"
          aria-current=${p.id === shown ? 'true' : 'false'}
          aria-label=${`Photo ${i + 1}`}
          @click=${() => {
            open(p);
          }}
        >
          <img src=${url(p.path)} alt="" loading="lazy" draggable="false" />
        </button>`
    )}
  </div>`;
}
