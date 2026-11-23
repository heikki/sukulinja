import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { visionModel } from '@/client/assistant-choices';
import { assistantOn } from '@/client/assistant-flag';
import { dialogStyles } from '@/client/dialog-styles';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { CLAUDE_MODELS } from '@/common/assistant-choices';
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
import { pageWork } from './page-work';
import { clearAsk, renderPagesMenu, surveyAsk } from './pages-menu';
import type { PagesActions, PagesMenu } from './pages-menu';
import type { BookListEvent, VolumeOpen } from './picker';
import { renderActs } from './row-acts';
import type { RowActions } from './row-acts';
import { hasOthers, offList, treeRows } from './rows';
import type { VolumeRow } from './rows';
import {
  bookTableStyles,
  CHECK_ICON,
  pinUnderHead,
  renderBookTable,
  renderRefused,
  revealShown
} from './table';

import './picker';

export type VolumeOpenEvent = CustomEvent<VolumeOpen>;

// Where the table would be, why there's none.
function renderEmpty(why: string) {
  return html`<div class="table"><p class="empty">${why}</p></div>`;
}

// How often the Volumes are asked for again while one downloads.
const POLL_MS = 2000;

// The Volumes tab of the corner panel: one table by archive, of the
// dataset's Book list (_This tree_) or of every Volume with something on
// this computer, whatever tree it's of (_All books_), the choice offered
// only when this computer has Volumes the Book list leaves out. Either
// way each Volume says how many of the dataset's Citations link into it,
// its page numbers and how much of it is downloaded. A right-click on
// its row opens the menu of its page numbers; its buttons start or stop its
// download (an offloaded one brought back first), and a trash button
// takes the next step off this computer: offloaded with an offload folder
// chosen, else removed from disk (asked first); then, kept in the folder,
// removed from it too (asked first); and with nothing left, one added by
// hand and cited nowhere taken off the list. Typing filters
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
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }

      button.only {
        flex: none;
        padding: 0.3rem 0.65rem;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: none;
        color: var(--muted);
        font-size: 0.85rem;
        cursor: pointer;
      }

      button.only[aria-pressed='true'] {
        background: var(--border);
        color: var(--fg);
      }

      button.only svg {
        vertical-align: -1px;
      }

      p.empty {
        margin: 0.75rem 0 0;
        color: var(--muted);
        font-size: 0.85rem;
      }

      /* Set off from the table by a line, about as far below it as the
         panel's edge is below the line's words. */
      .foot {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border);
      }

      .foot .summary {
        flex: 1;
        margin: 0;
      }

      /* On one line with the summary: its words, then the meter. */
      .cache {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--muted);
        font-size: 0.8rem;
        white-space: nowrap;
      }

      .meter {
        width: 5rem;
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

  // Whether only the Book list's Volumes are shown, or every one on this
  // computer too.
  @state() private treeOnly = true;
  @state() private listed: ListedBook[] | 'failed' | null = null;
  @state() private installed: InstalledBook[] | 'failed' | null = null;
  @state() private cache: ScanCacheStatus | null = null;
  @state() private filter = '';

  // Whether the Volume picker is open.
  @state() private picking = false;

  // The menu of a Volume's page numbers, or its question, while open.
  @state() private pagesMenu: PagesMenu | null = null;

  // The Volume whose removal, from disk or for good, waits to be confirmed.
  @state() private confirming: { book: VolumeRow; forGood: boolean } | null =
    null;

  // The offload folder, so the trash button offloads into it; null for
  // none.
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

  // The row's menu where it was right-clicked: its page numbers', for
  // one whose page numbers are known.
  private readonly openMenu = (book: VolumeRow, e: MouseEvent) => {
    e.preventDefault();
    if (book.pages === null || this.asking.busy) return;
    const box = this.getBoundingClientRect();
    this.pagesMenu = {
      book,
      at: { x: e.clientX - box.left, y: e.clientY - box.top }
    };
  };

  // Asked first when it takes pages away; a survey taking none isn't.
  private async askPages(book: VolumeRow, what: 'survey' | 'clear') {
    const at = this.pagesMenu?.at ?? { x: 0, y: 0 };
    const work = pageWork(this.state);
    const run = () => {
      void this.doing(async () => {
        await work[what](book);
      });
    };
    const { byHand, pinned } = await work.counts(book).catch(() => ({
      byHand: 0,
      pinned: 0
    }));
    if (what === 'survey' && byHand === 0) {
      run();
      return;
    }
    this.pagesMenu = {
      book,
      at,
      ask:
        what === 'survey'
          ? {
              heading: surveyAsk(byHand),
              step: { label: 'Survey and take them away', run }
            }
          : {
              heading: clearAsk(pinned),
              step: { label: 'Clear page numbers', run }
            }
    };
  }

  private pagesActions(): PagesActions {
    const model = visionModel.get();
    return {
      model: assistantOn.get()
        ? (CLAUDE_MODELS.find((m) => m.id === model)?.label ?? model)
        : null,
      mark: (book, as) => {
        void this.doing(async () => {
          await pageWork(this.state).mark(book, as);
        });
      },
      survey: (book) => {
        void this.askPages(book, 'survey');
      },
      clear: (book) => {
        void this.askPages(book, 'clear');
      }
    };
  }

  private readonly does: Omit<RowActions, 'busy' | 'folder' | 'frees'> = {
    askFrees: (book) => {
      void this.askFrees(book.id);
    },
    download: (book, action: DownloadAction) => {
      const { app } = this.state;
      const send = action === 'start' ? app.startDownload : app.stopDownload;
      void this.doing(async () => {
        await send(book.id);
      });
    },
    // At once, as nothing leaves for good.
    offload: (book) => {
      void this.doing(async () => await this.state.app.offload(book.id));
    },
    remove: (book) => {
      this.confirming = { book, forGood: false };
    },
    purge: (book) => {
      this.confirming = { book, forGood: true };
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

  // All of it off the disk, or out of the offload folder too.
  private async removeFromDisk(book: VolumeRow, forGood: boolean) {
    this.confirming = null;
    const { app } = this.state;
    await this.doing(async () => {
      await (forGood
        ? app.removeForGood(book.id)
        : app.removeFromDisk(book.id));
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

  // The filter to the Book list, when this computer has more.
  private offered() {
    const { listed, installed } = this;
    if (!Array.isArray(installed)) return false;
    return !Array.isArray(listed) || hasOthers(listed, installed);
  }

  private renderOnly() {
    return html`<button
      class="only"
      aria-pressed=${this.treeOnly ? 'true' : 'false'}
      title="Only the volumes of this tree, not every one on this computer"
      @click=${() => {
        this.treeOnly = !this.treeOnly;
      }}
    >
      ${this.treeOnly ? CHECK_ICON : nothing} This tree
    </button>`;
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

  // The Book list's Volumes, with every other one on this computer unless
  // `treeOnly`; or why there are none.
  private rows(treeOnly: boolean): VolumeRow[] | string {
    const { listed, installed } = this;
    if (listed === null || installed === null) return 'Loading…';
    const fromAll = Array.isArray(installed) ? installed : [];
    const fromTree = Array.isArray(listed) ? listed : [];
    const rows = [
      ...treeRows(fromTree, fromAll),
      ...(treeOnly ? [] : offList(fromTree, fromAll))
    ];
    if (rows.length > 0) return rows;
    if (listed === 'failed') {
      return "Astia couldn't be reached, and the volumes here aren't known yet.";
    }
    return 'No sources here cite a Volume yet. Add volumes to look through.';
  }

  private renderBody(rows: VolumeRow[] | string, shown: VolumeRow[]) {
    if (typeof rows === 'string') return renderEmpty(rows);
    if (shown.length === 0) {
      return renderEmpty(`No volume matches “${this.filter.trim()}”.`);
    }
    return renderBookTable({
      books: shown,
      shown: this.shownId(),
      acts: (b) =>
        renderActs(b, {
          ...this.does,
          busy: this.asking.busy,
          folder: this.folder !== null,
          frees: this.frees
        }),
      open: (b) => {
        this.open(b.id, b.label);
      },
      menu: this.openMenu
    });
  }

  // What the table shows, and the Scan cache's fill.
  private renderFoot(shown: VolumeRow[]) {
    if (shown.length === 0) return nothing;
    return html`<div class="foot">
      <p class="summary">${listSummary(shown)}</p>
      ${this.renderCache()}
    </div>`;
  }

  override render() {
    const offered = this.offered();
    const rows = this.rows(!offered || this.treeOnly);
    const shown =
      typeof rows === 'string'
        ? []
        : rows.filter((b) => matches(b, this.filter));
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
        ${offered ? this.renderOnly() : nothing}
        <button
          class="add"
          @click=${() => {
            this.picking = true;
          }}
        >
          Add volumes…
        </button>
      </div>
      ${this.renderBody(rows, shown)} ${this.renderFoot(shown)}
      ${renderRefused(this.asking.refused)} ${this.renderConfirm()}
      ${renderPagesMenu(this.pagesMenu, this.pagesActions(), () => {
        this.pagesMenu = null;
      })}
      ${this.renderPicker()}
    `;
  }

  // Asked before a Volume's Images leave the disk.
  private renderConfirm() {
    const { confirming } = this;
    if (confirming === null) return nothing;
    return renderLeaveDialog({
      ...confirming,
      confirm: () => {
        void this.removeFromDisk(confirming.book, confirming.forGood);
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
