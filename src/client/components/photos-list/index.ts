import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PhotoRow } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import { peopleLine } from './helpers';

// Every Photo of the dataset as thumbnails, those no one is linked to or
// tagged in first, each with how many people are on it. Picking one opens
// it in the Photo viewer with no person, to step through them all there;
// the one it shows is marked. A tab of the corner panel, as the Church
// books are.
@customElement('sl-photos-list')
class PhotosListElement extends SignalWatcher(LitElement) {
  static override styles = [
    cornerListStyles,
    css`
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
        align-content: start;
        gap: 0.75rem 0.5rem;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        margin: 0 -0.25rem 1rem;
        padding: 0.25rem;
      }

      button.photo {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0;
        border: 0;
        background: none;
        color: var(--muted);
        font-size: 0.8rem;
        text-align: left;
      }

      .thumb {
        aspect-ratio: 1;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--bg);
      }

      button.photo:hover .thumb {
        border-color: var(--accent);
      }

      button.photo.viewing .thumb {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }

      .thumb img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  override connectedCallback() {
    super.connectedCallback();
    this.state.photos.load();
  }

  private renderPhoto(p: PhotoRow, shown: number | null) {
    const line = peopleLine(p.people.length);
    const viewing = p.id === shown;
    return html`<button
      class="photo ${viewing ? 'viewing' : ''}"
      aria-current=${viewing ? 'true' : 'false'}
      aria-label=${`Photo, ${line.toLowerCase()}`}
      @click=${() => {
        this.state.chart.openPhoto(p, 'all');
      }}
    >
      <span class="thumb">
        <img
          src=${this.state.api.mediaUrl(p.path)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
        />
      </span>
      <span>${line}</span>
    </button>`;
  }

  override render() {
    const all = this.state.photos.all.get();
    if (all === null) return html`<p class="muted">Loading…</p>`;
    if (all === 'failed') {
      return html`<p class="muted">Couldn't reach the app.</p>`;
    }
    if (all.length === 0) {
      return html`<p class="muted">There are no photos here.</p>`;
    }
    const shown = this.state.photoViewer.opened.get()?.id ?? null;
    return html`<div class="grid">
      ${all.map((p) => this.renderPhoto(p, shown))}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-photos-list': PhotosListElement;
  }
}
