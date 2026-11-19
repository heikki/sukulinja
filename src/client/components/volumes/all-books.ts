import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { InstalledBook, ScanCacheStatus } from '@/common/types';

import { formatBytes } from '../settings/helpers';
import { busy, downloadActions, matches, pagesCell } from './helpers';
import type { DownloadAction } from './helpers';
import {
  actButton,
  bookTableStyles,
  BRING_BACK_ICON,
  CHECK_ICON,
  DOWNLOAD_ICON,
  EMPTY_SLOT,
  OFFLOAD_ICON,
  renderBookTable,
  renderRefused,
  revealShown,
  STOP_ICON,
  TRASH_ICON
} from './table';

// What leaving the disk takes: all of a Volume, or all but its cited
// Images.
type Leaving = 'remove' | 'offload';

// How often the Volumes are asked for again while one downloads.
const POLL_MS = 2000;

// The Volumes tab's _All books_: every Volume with something on this
// computer, whatever tree it's of, as a table by archive, with the Scan
// cache's fill against its cap above it, and what's known of each one's
// page numbers. Each one's page numbers are marked checked there, which
// locks them, its download started or stopped, and what of it is on disk
// removed, asked first. Typing filters it,
// as the Book list's. Clicking a row opens it (`open-volume`).
@customElement('sl-all-books')
class AllBooksElement extends LitElement {
  static override styles = [
    bookTableStyles,
    css`
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

  @state() private books: InstalledBook[] | 'failed' | null = null;
  @state() private cache: ScanCacheStatus | null = null;
  @state() private filter = '';

  // The Volume the Scan viewer shows, marked in the table.
  @property({ attribute: false }) shown: string | null = null;

  // The shown Volume last scrolled to, so it's brought into view once as
  // the list opens and again only when another is shown.
  private revealed: string | null = null;

  // The Volume whose removal from disk, or offload, waits to be confirmed
  // in its row.
  @state() private confirming: { id: string; what: Leaving } | null = null;

  // Removing a Volume from disk or offloading it; why it was refused.
  private readonly asking = new Asking(this);

  @consume({ context: appState }) private readonly state!: AppState;

  private poll: ReturnType<typeof setTimeout> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.revealed = null;
    void this.load();
  }

  override updated() {
    if (this.shown !== this.revealed && revealShown(this.shadowRoot)) {
      this.revealed = this.shown;
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

  // The Volumes and the cache, asked for again while any downloads; one
  // that fails keeps what was shown, once something was.
  private async load() {
    this.stopPolling();
    const { app } = this.state;
    try {
      const [books, cache] = await Promise.all([
        app.allBooks(),
        app.scanCache()
      ]);
      this.cache = cache;
      this.show(books);
    } catch {
      if (!Array.isArray(this.books)) this.books = 'failed';
    }
  }

  private show(books: InstalledBook[]) {
    this.books = books;
    this.stopPolling();
    if (busy(books) && this.isConnected) {
      this.poll = setTimeout(() => {
        void this.load();
      }, POLL_MS);
    }
  }

  private async act(book: InstalledBook, action: DownloadAction) {
    const { app } = this.state;
    const send = action === 'start' ? app.startDownload : app.stopDownload;
    await send(book.id).catch(() => undefined);
    await this.load();
  }

  // All of it off the disk, or all but its cited Images.
  private async leave(book: InstalledBook, what: Leaving) {
    this.confirming = null;
    const { app } = this.state;
    await this.asking.run(async () => {
      this.show(
        await (what === 'remove'
          ? app.removeFromDisk(book.id)
          : app.offload(book.id))
      );
      this.cache = await app.scanCache();
    });
  }

  private async bringBack(book: InstalledBook) {
    await this.asking.run(async () => {
      this.show(await this.state.app.bringBack(book.id));
    });
  }

  private open(book: InstalledBook) {
    this.dispatchEvent(
      new CustomEvent('open-volume', {
        detail: { volumeId: book.id, label: book.label }
      })
    );
  }

  private async check(book: InstalledBook) {
    await this.asking.run(async () => {
      const checked = book.pages !== 'checked';
      this.show(await this.state.app.checkPages(book.id, checked));
    });
  }

  // Removing a Volume's Images from disk, or all but the cited ones, asked
  // first in its row.
  private renderConfirm(book: InstalledBook, what: Leaving) {
    const ask =
      what === 'remove'
        ? `Remove ${formatBytes(book.onDisk.bytes)} from disk?`
        : 'Keep only the cited images on disk?';
    return [
      html`<span class="ask">${ask}</span>`,
      html`<button
        class="text danger"
        @click=${() => {
          void this.leave(book, what);
        }}
      >
        ${what === 'remove' ? 'Remove' : 'Offload'}
      </button>`,
      html`<button
        class="text"
        @click=${() => {
          this.confirming = null;
        }}
      >
        Cancel
      </button>`
    ];
  }

  // Marking its page numbers, its download or bringing it back, offloading
  // it and removing it from disk, each in its place.
  private renderActs(book: InstalledBook) {
    const { confirming } = this;
    if (confirming?.id === book.id) {
      return this.renderConfirm(book, confirming.what);
    }
    const checked = book.pages === 'checked';
    const [download] = downloadActions(book);
    return [
      actButton(
        checked ? 'Unmark page numbers checked' : 'Mark page numbers checked',
        CHECK_ICON,
        () => {
          void this.check(book);
        },
        { pressed: checked, disabled: this.asking.busy }
      ),
      book.offloaded
        ? actButton(
            'Bring back',
            BRING_BACK_ICON,
            () => {
              void this.bringBack(book);
            },
            {
              title: 'Bring back: fetch its images from Astia again',
              disabled: this.asking.busy
            }
          )
        : download === undefined
          ? EMPTY_SLOT
          : actButton(
              download.label,
              download.action === 'start' ? DOWNLOAD_ICON : STOP_ICON,
              () => {
                void this.act(book, download.action);
              }
            ),
      book.offloaded || book.onDisk.cached === 0
        ? EMPTY_SLOT
        : actButton(
            'Offload',
            OFFLOAD_ICON,
            () => {
              this.confirming = { id: book.id, what: 'offload' };
            },
            {
              title: 'Offload: keep only the cited images on disk',
              disabled: this.asking.busy
            }
          ),
      book.onDisk.bytes === 0
        ? EMPTY_SLOT
        : actButton(
            'Remove from disk',
            TRASH_ICON,
            () => {
              this.confirming = { id: book.id, what: 'remove' };
            },
            { disabled: this.asking.busy }
          )
    ];
  }

  private renderCache() {
    const { cache } = this;
    if (cache === null) return html`<span class="cache"></span>`;
    const pct = Math.min(100, (cache.used / cache.cap) * 100);
    return html`<span class="cache">
      Scan cache ${formatBytes(cache.used)} of ${formatBytes(cache.cap)}
      <span class="meter"><span style="width: ${pct}%"></span></span>
    </span>`;
  }

  private renderBody() {
    const { books } = this;
    if (books === null) return html`<p class="muted">Loading…</p>`;
    if (books === 'failed') {
      return html`<p class="muted">
        The volumes on this computer couldn't be listed.
      </p>`;
    }
    if (books.length === 0) {
      return html`<p class="muted">
        Nothing of any volume is on this computer yet.
      </p>`;
    }
    const shown = books.filter((b) => matches(b, this.filter));
    if (shown.length === 0) {
      return html`<p class="muted">No volume here matches.</p>`;
    }
    return renderBookTable({
      books: shown,
      shown: this.shown,
      column: {
        header: 'Page numbers',
        cell: (b) => {
          const { text, title } = pagesCell(b.pages);
          return html`<span title=${title}>${text}</span>`;
        }
      },
      acts: (b) => this.renderActs(b),
      noArchive: 'Not in your parishes',
      open: (b) => {
        this.open(b);
      }
    });
  }

  override render() {
    return html`
      <div class="bar">
        <input
          aria-label="Filter volumes"
          placeholder="Filter by year or name"
          .value=${this.filter}
          @input=${(e: InputEvent) => {
            this.filter = (e.target as HTMLInputElement).value;
          }}
        />
        ${this.renderCache()}
      </div>
      ${this.renderBody()} ${renderRefused(this.asking.refused)}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-all-books': AllBooksElement;
  }
}
