import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { volumeTitle } from '@/client/link-labels';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ChurchBookArchive, ChurchBookVolume } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import { fetchVolumes, sendDownload } from './api';
import { busy, downloadActions, volumeLine } from './helpers';
import type { DownloadAction } from './helpers';

// How often a parish's Volumes are asked for again while one downloads.
const POLL_MS = 2000;

export type VolumeOpenEvent = CustomEvent<{ volumeId: string; label: string }>;

// The church books apart from any citation: the archives the dataset's
// sources are in, most cited first, by their titles in Astia, then an
// archive's Volumes in Astia's order, each with what of it is on disk and
// its download to start, stop or remove. Clicking a Volume opens it
// (`open-volume`). A tab of the corner panel; leaving it, by another tab
// or closing, stops asking.
@customElement('sl-church-books-list')
class ChurchBooksListElement extends LitElement {
  static override styles = [
    cornerListStyles,
    css`
      /* A Volume's row, its download's buttons at its end. */
      li.book {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding-right: 0.75rem;
      }

      li.book button.row {
        flex: 1;
        min-width: 0;
      }

      button.act {
        flex: none;
        padding: 0.2rem 0.55rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: none;
        color: var(--fg);
        font-size: 0.8rem;
      }

      p.parish {
        margin: 0 0 0.25rem;
        font-weight: 500;
      }

      button.act:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
    `
  ];

  @state() private parishes: ChurchBookArchive[] | 'failed' | null = null;

  @state() private parish: ChurchBookArchive | null = null;

  @state() private volumes: ChurchBookVolume[] | 'failed' | null = null;

  // How many of the dataset's Citations link into each of the parish's
  // Volumes; null until known, and if it can't be.
  @state() private cited: Record<string, number> | null = null;

  @consume({ context: appState }) private readonly state!: AppState;

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.state.api
      .archives()
      .then((parishes) => {
        this.parishes = parishes;
      })
      .catch(() => {
        this.parishes = 'failed';
      });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  private stopPolling() {
    if (this.poll !== null) clearTimeout(this.poll);
    this.poll = null;
  }

  // The parish's Volumes, asked for again while any downloads; one that
  // fails keeps what was shown, once something was.
  private async load(parish: ChurchBookArchive) {
    this.stopPolling();
    try {
      const volumes = await fetchVolumes(parish.archiveId);
      if (this.parish !== parish) return;
      this.volumes = volumes;
    } catch {
      if (this.parish !== parish) return;
      if (!Array.isArray(this.volumes)) this.volumes = 'failed';
    }
    if (Array.isArray(this.volumes) && busy(this.volumes) && this.isConnected) {
      this.poll = setTimeout(() => {
        void this.load(parish);
      }, POLL_MS);
    }
  }

  private pickParish(parish: ChurchBookArchive | null) {
    this.stopPolling();
    this.parish = parish;
    this.volumes = null;
    this.cited = null;
    if (parish === null) return;
    void this.load(parish);
    void this.loadCited(parish);
  }

  private async loadCited(parish: ChurchBookArchive) {
    const cited = await this.state.api
      .archiveCitations(parish.archiveId)
      .catch(() => null);
    if (this.parish === parish) this.cited = cited;
  }

  private async act(volume: ChurchBookVolume, action: DownloadAction) {
    const parish = this.parish;
    await sendDownload(volume.id, action).catch(() => undefined);
    if (parish !== null && parish === this.parish) await this.load(parish);
  }

  private renderParishes() {
    const all = this.parishes;
    if (all === null) return html`<p class="muted">Loading…</p>`;
    if (all === 'failed') {
      return html`<p class="muted">Couldn't reach the app.</p>`;
    }
    if (all.length === 0) {
      return html`<p class="muted">No sources here cite a church book.</p>`;
    }
    return html`<ul>
      ${all.map(
        (p) =>
          html`<li>
            <button
              class="row"
              @click=${() => {
                this.pickParish(p);
              }}
            >
              <span class="text">${p.title}</span>
            </button>
          </li>`
      )}
    </ul>`;
  }

  private renderVolume(volume: ChurchBookVolume) {
    return html`<li class="book">
      <button
        class="row"
        ?disabled=${!volume.digitized}
        @click=${() => {
          this.dispatchEvent(
            new CustomEvent('open-volume', {
              detail: { volumeId: volume.id, label: volume.label }
            })
          );
        }}
      >
        <span class="text">${volumeTitle(volume.label)}</span>
        <span class="on"
          >${volumeLine(volume, this.cited?.[volume.id] ?? null)}</span
        >
      </button>
      ${downloadActions(volume).map(
        ({ action, label }) =>
          html`<button
            class="act"
            @click=${() => {
              void this.act(volume, action);
            }}
          >
            ${label}
          </button>`
      )}
    </li>`;
  }

  private renderVolumes() {
    const all = this.volumes;
    if (all === null) {
      return html`<p class="muted">Asking Astia for the books…</p>`;
    }
    if (all === 'failed') {
      return html`<p class="muted">
        Astia couldn't be reached, and its books here aren't known yet.
      </p>`;
    }
    if (all.length === 0) {
      return html`<p class="muted">Astia lists no church books here.</p>`;
    }
    return html`<ul>
      ${all.map((v) => this.renderVolume(v))}
    </ul>`;
  }

  private renderBack() {
    if (this.parish === null) return nothing;
    return html`<div class="actions">
      <button
        class="toggle"
        @click=${() => {
          this.pickParish(null);
        }}
      >
        ‹ All archives
      </button>
    </div>`;
  }

  override render() {
    if (this.parish === null) return this.renderParishes();
    return html`<p class="parish">${this.parish.title}</p>
      ${this.renderVolumes()} ${this.renderBack()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-church-books-list': ChurchBooksListElement;
  }
}
