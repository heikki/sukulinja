import { css, html, LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import type { VolumeOpen } from './picker';

import './all-books';
import './book-list';

export type VolumeOpenEvent = CustomEvent<VolumeOpen>;

type Mode = 'tree' | 'all';

const MODES: ReadonlyArray<{ mode: Mode; label: string }> = [
  { mode: 'tree', label: 'This tree' },
  { mode: 'all', label: 'All books' }
];

// The Volumes tab of the corner panel, in one of two modes: _This tree_,
// the dataset's Book list (book-list.ts), and _All books_, every Volume
// with something on this computer, whatever tree it's of (all-books.ts).
// Either one's Volume clicked is opened (`open-volume`).
@customElement('sl-volumes-list')
class VolumesListElement extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      flex-direction: column;
    }

    .modes {
      display: flex;
      align-self: flex-start;
      margin-bottom: 0.5rem;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    .modes button {
      padding: 0.2rem 0.65rem;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--muted);
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;
    }

    .modes button[aria-pressed='true'] {
      background: var(--border);
      color: var(--fg);
    }
  `;

  @state() private mode: Mode = 'tree';

  private readonly onOpen = (e: VolumeOpenEvent) => {
    this.dispatchEvent(new CustomEvent('open-volume', { detail: e.detail }));
  };

  override render() {
    return html`
      <div class="modes" role="group" aria-label="Volumes shown">
        ${MODES.map(
          (m) =>
            html`<button
              aria-pressed=${this.mode === m.mode ? 'true' : 'false'}
              @click=${() => {
                this.mode = m.mode;
              }}
            >
              ${m.label}
            </button>`
        )}
      </div>
      ${
        this.mode === 'tree'
          ? html`<sl-book-list @open-volume=${this.onOpen}></sl-book-list>`
          : html`<sl-all-books @open-volume=${this.onOpen}></sl-all-books>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-volumes-list': VolumesListElement;
  }
}
