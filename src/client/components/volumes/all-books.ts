import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { dialogStyles } from '@/client/dialog-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type {
  InstalledBook,
  OffloadFolder,
  ScanCacheStatus
} from '@/common/types';

import { formatBytes } from '../settings/helpers';
import { busy, downloadActions, matches, pagesCell } from './helpers';
import type { DownloadAction } from './helpers';
import { renderLeaveDialog } from './leave-dialog';
import type { Leaving } from './leave-dialog';
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

// How often the Volumes are asked for again while one downloads.
const POLL_MS = 2000;

// The Volumes tab's _All books_: every Volume with something on this
// computer, whatever tree it's of, as a table by archive, with the Scan
// cache's fill against its cap above it, and what's known of each one's
// page numbers. Each one's page numbers are marked checked there, which
// locks them, its download started or stopped, and what of it is on disk
// removed or offloaded, asked first, and an offloaded one brought back.
// Typing filters it, as the Book list's. Clicking a row opens it (`open-volume`).
@customElement('sl-all-books')
class AllBooksElement extends LitElement {
  static override styles = [
    bookTableStyles,
    dialogStyles,
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

  // The Volume whose removal from disk, or offload, waits to be confirmed.
  @state() private confirming: { book: InstalledBook; what: Leaving } | null =
    null;

  // The offload folder, for the offload's question to say where its
  // Images go; null for none.
  @state() private folder: OffloadFolder | null = null;

  // What offloading a Volume would free, by its id, asked as its Offload
  // is pointed at; null when that can't be known.
  @state() private frees = new Map<string, number | null>();

  // Removing a Volume from disk or offloading it; why it was refused.
  private readonly asking = new Asking(this);

  @consume({ context: appState }) private readonly state!: AppState;

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

  // Asked once for each showing of the Volumes.
  private async askFrees(volumeId: string) {
    if (this.frees.has(volumeId)) return;
    this.frees.set(volumeId, null);
    const freed = await this.state.app.offloadFrees(volumeId).catch(() => null);
    this.frees = new Map(this.frees).set(volumeId, freed);
  }

  private show(books: InstalledBook[]) {
    this.books = books;
    this.frees = new Map();
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

  // Marking its page numbers, its download, offloading it and removing it
  // from disk, each in its place; an offloaded one is only brought back.
  private renderActs(book: InstalledBook) {
    if (book.offloaded !== null) {
      return [EMPTY_SLOT, EMPTY_SLOT, this.renderBringBack(book), EMPTY_SLOT];
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
      download === undefined
        ? EMPTY_SLOT
        : actButton(
            download.label,
            download.action === 'start' ? DOWNLOAD_ICON : STOP_ICON,
            () => {
              void this.act(book, download.action);
            }
          ),
      this.renderOffload(book),
      book.onDisk.bytes === 0
        ? EMPTY_SLOT
        : actButton(
            'Remove from disk',
            TRASH_ICON,
            () => {
              this.confirming = { book, what: 'remove' };
            },
            { disabled: this.asking.busy }
          )
    ];
  }

  // In the offload's place, with what comes back.
  private renderBringBack(book: InstalledBook) {
    const away = book.offloaded;
    const what =
      away === null
        ? ''
        : ` ${away.images} images, ${formatBytes(away.bytes)},`;
    return actButton(
      'Bring back',
      BRING_BACK_ICON,
      () => {
        void this.bringBack(book);
      },
      {
        title: `Bring back:${what} read again as they're shown`,
        disabled: this.asking.busy
      }
    );
  }

  // With an offload folder, offloaded at once, as nothing leaves for good;
  // with none, asked first.
  private renderOffload(book: InstalledBook) {
    if (book.onDisk.cached === 0) return EMPTY_SLOT;
    const freed = this.frees.get(book.id);
    const frees =
      freed === undefined || freed === null
        ? 'keep only the cited images on disk'
        : `frees ${formatBytes(freed)}, keeping the cited images`;
    return actButton(
      'Offload',
      OFFLOAD_ICON,
      () => {
        if (this.folder === null) this.confirming = { book, what: 'offload' };
        else void this.leave(book, 'offload');
      },
      {
        title: `Offload: ${frees}`,
        disabled: this.asking.busy,
        onHint: () => {
          void this.askFrees(book.id);
        }
      }
    );
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
      ${this.renderConfirm()}
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
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-all-books': AllBooksElement;
  }
}
