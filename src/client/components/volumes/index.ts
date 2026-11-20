import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type {
  InstalledBook,
  ListedBook,
  OffloadFolder,
  ScanCacheStatus
} from '@/common/types';

import { formatBytes } from '../settings/helpers';
import { busy, listSummary, matches } from './helpers';
import type { DownloadAction } from './helpers';
import { renderLeaveDialog } from './leave-dialog';
import type { Leaving } from './leave-dialog';
import type { BookListEvent, VolumeOpen } from './picker';
import { renderActs } from './row-acts';
import type { RowActions } from './row-acts';
import { allRows, hasOthers, treeRows } from './rows';
import type { VolumeRow } from './rows';
import {
  bookTableStyles,
  pinUnderHead,
  renderBookTable,
  renderRefused,
  revealShown
} from './table';

import './picker';

export type VolumeOpenEvent = CustomEvent<VolumeOpen>;

type Mode = 'tree' | 'all';

const MODES: ReadonlyArray<{ mode: Mode; label: string }> = [
  { mode: 'tree', label: 'This tree' },
  { mode: 'all', label: 'All books' }
];

// How often the Volumes are asked for again while one downloads.
const POLL_MS = 2000;

// The Volumes tab of the corner panel: one table by archive, of the
// dataset's Book list (_This tree_) or of every Volume with something on
// this computer, whatever tree it's of (_All books_), the choice offered
// only when this computer has Volumes the Book list leaves out. Either
// way each Volume says how many of the dataset's Citations link into it,
// its page numbers and how much of it is downloaded, with the same
// buttons: its page numbers marked checked, its download started or
// stopped, offloaded or brought back, removed from disk (asked first),
// or, added by hand and cited nowhere, taken off the list. Typing filters
// it, by a year a Volume covers or words in it. Clicking a row opens it
// (`open-volume`); the one the Scan viewer shows is marked. _Add
// volumes…_ opens the Volume picker, whose Volumes join the Book list.
// Leaving the tab stops asking.
@customElement('sl-volumes-list')
class VolumesListElement extends SignalWatcher(LitElement) {
  static override styles = [
    bookTableStyles,
    dialogStyles,
    css`
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

      .cache {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        color: var(--muted);
        font-size: 0.75rem;
      }

      .meter {
        height: 4px;
        border-radius: 2px;
        background: color-mix(in srgb, var(--fg) 10%, transparent);
        overflow: hidden;
      }

      .meter span {
        display: block;
        height: 100%;
        background: var(--accent);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private mode: Mode = 'tree';
  @state() private listed: ListedBook[] | 'failed' | null = null;
  @state() private installed: InstalledBook[] | 'failed' | null = null;
  @state() private cache: ScanCacheStatus | null = null;
  @state() private filter = '';

  // Whether the Volume picker is open.
  @state() private picking = false;

  // The Volume whose removal from disk, or offload, waits to be confirmed.
  @state() private confirming: { book: VolumeRow; what: Leaving } | null = null;

  // The offload folder, for the offload's question to say where its
  // Images go; null for none.
  @state() private folder: OffloadFolder | null = null;

  // What offloading a Volume would free, by its id, asked as its Offload
  // is pointed at; null when that can't be known.
  @state() private frees = new Map<string, number | null>();

  // The shown Volume last scrolled to, so it's brought into view once as
  // the tab opens and again only when another is shown.
  private revealed: string | null = null;

  private readonly asking = new Asking(this);

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.revealed = null;
    void this.load();
    void this.state.app
      .offloadFolder()
      .then((folder) => {
        this.folder = folder;
      })
      .catch(() => undefined);
  }

  override updated() {
    pinUnderHead(this.shadowRoot);
    const shown = this.shownId();
    if (shown !== this.revealed && revealShown(this.shadowRoot)) {
      this.revealed = shown;
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopPolling();
  }

  private shownId() {
    return this.state.viewer.volume.get()?.id ?? null;
  }

  private stopPolling() {
    if (this.poll !== null) clearTimeout(this.poll);
    this.poll = null;
  }

  // Both lists and the cache, asked for again while any Volume downloads;
  // a list that fails keeps what was shown, once something was.
  private async load() {
    this.stopPolling();
    const { api, app } = this.state;
    const [listed, installed, cache] = await Promise.all([
      api.bookList().catch(() => null),
      app.allBooks().catch(() => null),
      app.scanCache().catch(() => null)
    ]);
    if (listed !== null) this.listed = listed;
    else if (!Array.isArray(this.listed)) this.listed = 'failed';
    if (installed !== null) this.installed = installed;
    else if (!Array.isArray(this.installed)) this.installed = 'failed';
    if (cache !== null) this.cache = cache;
    this.frees = new Map();
    const going = [listed ?? [], installed ?? []].some((l) => busy(l));
    if (going && this.isConnected) {
      this.poll = setTimeout(() => {
        void this.load();
      }, POLL_MS);
    }
  }

  // Done, refused or not, then both lists asked for again.
  private async doing(work: () => Promise<unknown>) {
    await this.asking.run(async () => {
      await work();
    });
    await this.load();
  }

  private readonly does: Omit<RowActions, 'busy' | 'frees'> = {
    askFrees: (book) => {
      void this.askFrees(book.id);
    },
    check: (book) => {
      void this.doing(
        async () =>
          await this.state.app.checkPages(book.id, book.pages !== 'checked')
      );
    },
    download: (book, action: DownloadAction) => {
      const { app } = this.state;
      const send = action === 'start' ? app.startDownload : app.stopDownload;
      void this.doing(async () => {
        await send(book.id);
      });
    },
    // With an offload folder, offloaded at once, as nothing leaves for
    // good; with none, asked first.
    offload: (book) => {
      if (this.folder === null) this.confirming = { book, what: 'offload' };
      else void this.leave(book, 'offload');
    },
    bringBack: (book) => {
      void this.doing(async () => await this.state.app.bringBack(book.id));
    },
    remove: (book) => {
      this.confirming = { book, what: 'remove' };
    },
    unlist: (book) => {
      void this.doing(async () => await this.state.api.unlistBook(book.id));
    }
  };

  // Asked once for each showing of the Volumes.
  private async askFrees(volumeId: string) {
    if (this.frees.has(volumeId)) return;
    this.frees.set(volumeId, null);
    const freed = await this.state.app.offloadFrees(volumeId).catch(() => null);
    this.frees = new Map(this.frees).set(volumeId, freed);
  }

  // All of it off the disk, or all but its cited Images.
  private async leave(book: VolumeRow, what: Leaving) {
    this.confirming = null;
    const { app } = this.state;
    await this.doing(async () => {
      await (what === 'remove'
        ? app.removeFromDisk(book.id)
        : app.offload(book.id));
    });
  }

  private readonly onListed = (e: BookListEvent) => {
    this.listed = e.detail;
  };

  private open(volumeId: string, label: string) {
    this.dispatchEvent(
      new CustomEvent('open-volume', { detail: { volumeId, label } })
    );
  }

  // The choice between the two, when there's more to all of them.
  private offered() {
    const { listed, installed } = this;
    if (!Array.isArray(installed)) return false;
    return !Array.isArray(listed) || hasOthers(listed, installed);
  }

  private renderModes() {
    return html`<div class="modes" role="group" aria-label="Volumes shown">
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
    </div>`;
  }

  private renderCache() {
    const { cache } = this;
    if (cache === null) return html`<span class="cache"></span>`;
    const pct = Math.min(100, (cache.used / cache.cap) * 100);
    return html`<span class="cache">
      Storage ${formatBytes(cache.used)} of ${formatBytes(cache.cap)}
      <span class="meter"><span style="width: ${pct}%"></span></span>
    </span>`;
  }

  // The rows of the mode, or why there are none.
  private rows(mode: Mode): VolumeRow[] | string {
    const { listed, installed } = this;
    if (listed === null || installed === null) return 'Loading…';
    const fromAll = Array.isArray(installed) ? installed : [];
    const fromTree = Array.isArray(listed) ? listed : [];
    if (mode === 'all') {
      if (installed === 'failed') {
        return "The volumes on this computer couldn't be listed.";
      }
      if (installed.length === 0) {
        return 'Nothing of any volume is on this computer yet.';
      }
      return allRows(installed, fromTree);
    }
    if (listed === 'failed') {
      return "Astia couldn't be reached, and the volumes here aren't known yet.";
    }
    if (listed.length === 0) {
      return 'No sources here cite a Volume yet. Add volumes to look through.';
    }
    return treeRows(listed, fromAll);
  }

  private renderBody(mode: Mode) {
    const rows = this.rows(mode);
    if (typeof rows === 'string') return html`<p class="muted">${rows}</p>`;
    const shown = rows.filter((b) => matches(b, this.filter));
    const table =
      shown.length === 0
        ? html`<p class="muted">No volume here matches.</p>`
        : renderBookTable({
            books: shown,
            shown: this.shownId(),
            acts: (b) =>
              renderActs(b, {
                ...this.does,
                busy: this.asking.busy,
                frees: this.frees
              }),
            open: (b) => {
              this.open(b.id, b.label);
            }
          });
    const { listed } = this;
    return html`${table}
    ${
      mode === 'tree' && Array.isArray(listed)
        ? html`<p class="summary">${listSummary(listed)}</p>`
        : nothing
    }`;
  }

  override render() {
    const offered = this.offered();
    const mode = offered ? this.mode : 'tree';
    return html`
      ${offered ? this.renderModes() : nothing}
      <div class="bar">
        <input
          aria-label="Filter volumes"
          placeholder="Filter by year or name"
          .value=${this.filter}
          @input=${(e: InputEvent) => {
            this.filter = (e.target as HTMLInputElement).value;
          }}
        />
        ${
          mode === 'all'
            ? this.renderCache()
            : html`<button
                class="add"
                @click=${() => {
                  this.picking = true;
                }}
              >
                Add volumes…
              </button>`
        }
      </div>
      ${this.renderBody(mode)} ${renderRefused(this.asking.refused)}
      ${this.renderConfirm()} ${this.renderPicker()}
    `;
  }

  // Asked before a Volume's Images leave the disk.
  private renderConfirm() {
    const { confirming } = this;
    if (confirming === null) return nothing;
    return renderLeaveDialog({
      ...confirming,
      folder: this.folder,
      confirm: () => {
        void this.leave(confirming.book, confirming.what);
      },
      cancel: () => {
        this.confirming = null;
      }
    });
  }

  private renderPicker() {
    if (!this.picking) return nothing;
    return html`<sl-volume-picker
      @book-listed=${this.onListed}
      @open-volume=${(e: CustomEvent<VolumeOpen>) => {
        this.picking = false;
        this.open(e.detail.volumeId, e.detail.label);
      }}
      @close=${() => {
        this.picking = false;
      }}
    ></sl-volume-picker>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-volumes-list': VolumesListElement;
  }
}
