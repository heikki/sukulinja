import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { volumeTitle } from '@/client/link-labels';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { ChurchBookArchive, ChurchBookVolume } from '@/common/types';

import { addParish, fetchParishes } from '../archive-search/api';
import { cornerListStyles } from '../corner-panel/list-styles';
import { fetchVolumes, sendDownload } from './api';
import { busy, downloadActions, othersOf, volumeLine } from './helpers';
import type { DownloadAction } from './helpers';

import '../archive-search';

// How often a parish's Volumes are asked for again while one downloads.
const POLL_MS = 2000;

export type VolumeOpenEvent = CustomEvent<{ volumeId: string; label: string }>;

// The church books apart from any citation: the archives the dataset's
// sources are in, most cited first, by their titles in Astia, then apart
// the install's other parishes, and finding another in Astia; then an
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

      /* The install's other parishes, under the dataset's own. */
      li.apart {
        margin-top: 0.5rem;
        padding: 0.45rem 0.75rem 0.2rem;
        color: var(--muted);
        font-size: 0.8rem;
      }

      sl-archive-search {
        margin-bottom: 1rem;
      }

      button.act:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
    `
  ];

  @state() private parishes: ChurchBookArchive[] | 'failed' | null = null;

  // The install's parishes the dataset's sources aren't in.
  @state() private others: ChurchBookArchive[] = [];

  // Whether a parish is being looked for in Astia, while the one chosen
  // is added, and why that failed.
  @state() private finding = false;
  @state() private adding = false;
  @state() private addError: string | null = null;

  @state() private parish: ChurchBookArchive | null = null;

  @state() private volumes: ChurchBookVolume[] | 'failed' | null = null;

  // How many of the dataset's Citations link into each of the parish's
  // Volumes; null until known, and if it can't be.
  @state() private cited: Record<string, number> | null = null;

  @consume({ context: appState }) private readonly state!: AppState;

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadParishes();
  }

  // The dataset's archives, then the install's other parishes; those only
  // when the app can say.
  private async loadParishes() {
    const [own, all] = await Promise.all([
      this.state.api.archives().catch(() => 'failed' as const),
      fetchParishes().catch(() => [])
    ]);
    this.parishes = own;
    this.others = own === 'failed' ? [] : othersOf(own, all);
  }

  // The archive found joins the install's parishes, and its books open.
  private async addFound(archive: ChurchBookArchive) {
    this.adding = true;
    this.addError = null;
    try {
      await addParish(archive.archiveId);
      this.finding = false;
      await this.loadParishes();
      this.pickParish(archive);
    } catch (err) {
      this.addError = err instanceof Error ? err.message : String(err);
    } finally {
      this.adding = false;
    }
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

  private renderParish(p: ChurchBookArchive) {
    return html`<li>
      <button
        class="row"
        @click=${() => {
          this.pickParish(p);
        }}
      >
        <span class="text">${p.title}</span>
      </button>
    </li>`;
  }

  private renderFind() {
    if (!this.finding) {
      return html`<div class="actions">
        <button
          class="toggle"
          @click=${() => {
            this.finding = true;
            this.addError = null;
          }}
        >
          Find a parish in Astia
        </button>
      </div>`;
    }
    return html`<sl-archive-search
      label="Parish in Astia"
      ?busy=${this.adding}
      .error=${this.addError}
      @archive-chosen=${(e: CustomEvent<ChurchBookArchive>) => {
        void this.addFound(e.detail);
      }}
      @cancel=${() => {
        this.finding = false;
      }}
    ></sl-archive-search>`;
  }

  private renderParishes() {
    const own = this.parishes;
    if (own === null) return html`<p class="muted">Loading…</p>`;
    if (own === 'failed') {
      return html`<p class="muted">Couldn't reach the app.</p>`;
    }
    const { others } = this;
    return html`
      ${
        own.length === 0
          ? html`<p class="muted">No sources here cite a church book.</p>`
          : nothing
      }
      ${
        own.length + others.length === 0
          ? nothing
          : html`<ul>
              ${own.map((p) => this.renderParish(p))}
              ${
                others.length === 0
                  ? nothing
                  : html`<li class="apart">Other parishes</li>
                      ${others.map((p) => this.renderParish(p))}`
              }
            </ul>`
      }
      ${this.renderFind()}
    `;
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
