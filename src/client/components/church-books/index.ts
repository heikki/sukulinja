import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { volumeTitle } from '@/client/link-labels';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ChurchBookParish, ChurchBookVolume } from '@/common/types';

import { cornerListStyles } from '../corner-panel/list-styles';
import { fetchParishes, fetchVolumes, sendDownload } from './api';
import { busy, downloadActions, volumeLine } from './helpers';
import type { DownloadAction } from './helpers';

import '../corner-panel/panel';

// How often a parish's Volumes are asked for again while one downloads.
const POLL_MS = 2000;

export type VolumeOpenEvent = CustomEvent<{ volumeId: string; label: string }>;

// The church books apart from any citation: the known parishes, then a
// parish's Volumes in Astia's order, each with what of it is on disk and
// its download to start, stop or remove. Clicking a Volume opens it
// (`open-volume`). In a corner panel over the chart, which asks to
// `close`.
@customElement('sl-church-books-dialog')
class ChurchBooksDialogElement extends LitElement {
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

      button.act:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
    `
  ];

  @state() private parishes: ChurchBookParish[] | 'failed' | null = null;

  @state() private parish: ChurchBookParish | null = null;

  @state() private volumes: ChurchBookVolume[] | 'failed' | null = null;

  // How many of the dataset's Citations link into each of the parish's
  // Volumes; null until known, and if it can't be.
  @state() private cited: Record<string, number> | null = null;

  @consume({ context: appState }) private readonly state!: AppState;

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void fetchParishes()
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
  private async load(parish: ChurchBookParish) {
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

  private pickParish(parish: ChurchBookParish | null) {
    this.stopPolling();
    this.parish = parish;
    this.volumes = null;
    this.cited = null;
    if (parish === null) return;
    void this.load(parish);
    void this.loadCited(parish);
  }

  private async loadCited(parish: ChurchBookParish) {
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
              <span class="text">${p.name}</span>
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
    return html`<button
      slot="actions"
      class="toggle"
      @click=${() => {
        this.pickParish(null);
      }}
    >
      ‹ All parishes
    </button>`;
  }

  override render() {
    const heading =
      this.parish === null
        ? 'Church books'
        : `Church books · ${this.parish.name}`;
    return html`<sl-corner-panel
      heading=${heading}
      kind="church-books"
      @close=${() => {
        this.dispatchEvent(new CustomEvent('close'));
      }}
    >
      ${this.parish === null ? this.renderParishes() : this.renderVolumes()}
      ${this.renderBack()}
    </sl-corner-panel>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-church-books-dialog': ChurchBooksDialogElement;
  }
}
