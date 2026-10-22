import { ContextProvider } from '@lit/context';
import { html, LitElement, nothing, svg } from 'lit';
import type { ReactiveElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '../settings';
import '../tree-view';

import { ApiError, openDatasetApi } from '@/client/dataset-api';
import { openLifecycleApi } from '@/client/dataset-api/lifecycle';
import { dialogStyles } from '@/client/dialog-styles';
import { focusRingStyles } from '@/client/focus-ring';
import { appState, openAppState } from '@/client/state';
import { slugFromFilename, withoutExtension } from '@/common/slug';
import type { DatasetInfo, ExportKind, ImportReview } from '@/common/types';

import { confirmDialog, errorNote, runAction } from './dialogs';
import type { Confirming, DatasetAction } from './dialogs';
import { EXPORT_FORMATS, exportDataset } from './exports';
import type { ExportNote } from './exports';
import { renderReview } from './import-review';
import { menuButton, renderRowMenu } from './row-menu';
import type { RowMenu, RowMenuActions } from './row-menu';
import { appStyles } from './styles';

const TRASH_ICON = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  ${svg`
    <path
      d="M 2.5 4.5 H 13.5 M 6 4.5 V 3 H 10 V 4.5 M 4 4.5 L 4.6 13 H 11.4 L 12 4.5 M 6.75 7 V 10.5 M 9.25 7 V 10.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `}
</svg>`;

// An import's review, waiting for Merge or Cancel.
interface Reviewing {
  review: ImportReview;
  answer: (merge: boolean) => void;
}

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?=\/|$)/u;

function currentSlug(): string | null {
  const m = DATASET_RE.exec(window.location.pathname);
  return m === null ? null : m.groups!.slug!;
}

// The dataset's app state, provided by `host`. Given the slug rather than
// reading the host's: the app build sets undecorated fields before
// decorated ones, so `slug` isn't set yet when this runs.
function provideDataset(host: ReactiveElement, slug: string | null) {
  if (slug === null) return null;
  return new ContextProvider(host, {
    context: appState,
    initialValue: openAppState(openDatasetApi(slug))
  });
}

function renderLink(d: DatasetInfo) {
  return html`
    <a href=${`/d/${d.slug}/`}>
      <span class="name">${d.displayName}</span>
      <span class="muted">
        ${d.personCount} people · ${d.familyCount} families
      </span>
    </a>
  `;
}

// An older version's database doesn't open; the file it came from isn't
// kept, so it's imported again, merging (ADR-0013), from the Import… beside
// it, whose dialog says what the app added is kept.
function renderOutdated(d: DatasetInfo) {
  return html`
    <div class="outdated">
      <span class="name">${d.displayName}</span>
      <span class="muted">Made by an older version.</span>
    </div>
  `;
}

@customElement('sl-app')
export class AppElement extends LitElement {
  static override styles = [focusRingStyles, dialogStyles, appStyles];

  // The datasets as a whole: listing, importing, exporting, undoing, deleting.
  private readonly lifecycle = openLifecycleApi();

  @state() private datasets: DatasetInfo[] | null = null;
  // Why the dataset list didn't load, in the app's words.
  @state() private datasetsError: string | null = null;
  @state() private readonly slug: string | null = currentSlug();
  // The dataset shown: its state, built over one API from its slug, and
  // provided to the screens below. A provider rather than `@provide`, whose
  // field can't be null, since the chooser has no dataset to provide.
  private readonly provider = provideDataset(this, currentSlug());
  @state() private pendingImport: File | null = null;
  // A row's menu: its dataset, and the corner it drops from.
  @state() private menu: RowMenu | null = null;
  // What's being exported, in the note's words.
  @state() private exporting: string | null = null;
  // Where the last export was saved, or why it failed.
  @state() private exportNote: ExportNote | null = null;
  // The name of an outdated dataset being imported again, so the import
  // replaces it.
  private reimportName: string | null = null;
  @state() private importNameInput = '';
  @state() private importing = false;
  @state() private importStatus: string | null = null;
  @state() private importError: string | null = null;
  // What importing into an existing dataset would change, waiting for
  // Merge or Cancel.
  @state() private review: Reviewing | null = null;
  // A dataset action waiting to be confirmed, or running.
  @state() private confirming: Confirming | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadDatasets();
  }

  private async loadDatasets() {
    try {
      this.datasets = await this.lifecycle.list();
      this.datasetsError = null;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.datasetsError = err.message;
    }
  }

  // Import a GEDCOM, whose local media can't come along (MyHeritage photos
  // still download server-side), or a GEDZIP carrying its media.
  private readonly onImportFileClick = () => {
    this.reimportName = null;
    this.pickFile();
  };

  private readonly reimport = (dataset: DatasetInfo) => {
    this.reimportName = dataset.displayName;
    this.pickFile();
  };

  private pickFile() {
    this.renderRoot.querySelector<HTMLInputElement>('#file-input')?.click();
  }

  private readonly onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    this.pendingImport = file;
    this.importNameInput = this.reimportName ?? withoutExtension(file.name);
    this.reimportName = null;
    this.importStatus = null;
    this.importError = null;
  };

  private readonly onImportNameInput = (e: Event) => {
    this.importNameInput = (e.target as HTMLInputElement).value;
  };

  private readonly onImportKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') this.confirmImport();
  };

  private readonly cancelImport = () => {
    if (this.importing) return;
    this.pendingImport = null;
  };

  private readonly confirmImport = () => {
    const file = this.pendingImport;
    if (file === null) return;
    const name = this.importNameInput.trim();
    // Send the readable name; the server keeps it for display and derives the
    // slug. Guard against names that slugify to nothing (e.g. only punctuation).
    if (name === '' || slugFromFilename(name) === '') return;
    void this.importFile(file, name);
  };

  private async importFile(file: File, name: string) {
    this.importing = true;
    this.importStatus = 'Uploading…';
    this.importError = null;
    try {
      const info = await this.lifecycle.importFile(
        { file, name },
        {
          progress: (message) => {
            this.importStatus = message;
          },
          review: async (review) => {
            const answered = Promise.withResolvers<boolean>();
            this.review = { review, answer: answered.resolve };
            return await answered.promise;
          }
        }
      );
      if (info === null) this.pendingImport = null;
      else window.location.assign(`/d/${info.slug}/`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.importError = err.message;
    } finally {
      this.review = null;
      this.importing = false;
      this.importStatus = null;
    }
  }

  // Merge or Cancel the import waiting on its review.
  private readonly answerReview = (merge: boolean) => {
    const waiting = this.review;
    if (waiting === null) return;
    this.review = null;
    this.importStatus = merge ? 'Saving…' : 'Cancelling…';
    waiting.answer(merge);
  };

  private readonly exportAs = async (
    dataset: DatasetInfo,
    kind: ExportKind
  ) => {
    if (this.exporting !== null) return;
    const { name } = EXPORT_FORMATS[kind];
    this.exporting = `Exporting ${dataset.displayName} as ${name}…`;
    this.exportNote = null;
    try {
      this.exportNote = await exportDataset(this.lifecycle, dataset, kind);
    } finally {
      this.exporting = null;
    }
  };

  private renderExportNote() {
    if (this.exporting !== null) {
      return html`<p class="export-note">${this.exporting}</p>`;
    }
    const note = this.exportNote;
    if (note === null) return nothing;
    return note.ok
      ? html`<p class="export-note">${note.text}</p>`
      : errorNote('Export failed', note.text);
  }

  private readonly menuActions: RowMenuActions = {
    export: (d, kind) => {
      void this.exportAs(d, kind);
    },
    undo: (d) => {
      this.request('undo', d);
    }
  };

  private readonly setMenu = (menu: RowMenu | null) => {
    this.menu = menu;
  };

  private readonly request = (action: DatasetAction, dataset: DatasetInfo) => {
    this.confirming = { action, dataset, busy: false, error: null };
  };

  private readonly cancelConfirm = () => {
    if (this.confirming?.busy !== false) return;
    this.confirming = null;
  };

  private readonly runConfirmed = async () => {
    const c = this.confirming;
    if (c === null) return;
    this.confirming = { ...c, busy: true, error: null };
    const error = await runAction(this.lifecycle, c);
    if (error !== null) {
      this.confirming = { ...c, busy: false, error };
      return;
    }
    this.confirming = null;
    if (c.action === 'delete' && c.dataset.slug === this.slug) {
      window.location.assign('/');
      return;
    }
    await this.loadDatasets();
  };

  private renderImportDialog() {
    const file = this.pendingImport;
    if (file === null) return nothing;
    const slug = slugFromFilename(this.importNameInput);
    // Names that slugify alike share a folder, so importing one replaces the
    // other — the only time the slug is worth surfacing.
    const replaces = this.datasets?.find((d) => d.slug === slug);
    return html`
      <div class="overlay" @click=${this.cancelImport}>
        <div
          class="dialog import-dialog"
          role="dialog"
          aria-labelledby="import-title"
          @click=${(e: Event) => {
            e.stopPropagation();
          }}
        >
          <h2 id="import-title">Import ${file.name}</h2>
          ${
            this.review === null
              ? this.renderImportForm(replaces)
              : renderReview(this.review.review)
          }
          ${
            this.importing && this.review === null && this.importStatus !== null
              ? html`<p class="status">${this.importStatus}</p>`
              : nothing
          }
          ${errorNote('Import failed', this.importError)}
          ${this.renderImportActions(slug, replaces !== undefined)}
        </div>
      </div>
    `;
  }

  private renderImportForm(replaces: DatasetInfo | undefined) {
    return html`
      <label class="field">
        Name
        <input
          type="text"
          .value=${this.importNameInput}
          ?disabled=${this.importing}
          @input=${this.onImportNameInput}
          @keydown=${this.onImportKeydown}
        />
        ${
          replaces === undefined
            ? nothing
            : html`<span class="hint">
                Merges into the existing dataset
                <strong>${replaces.displayName}</strong>, keeping what the app
                added. You'll see what changes before it's saved.
              </span>`
        }
      </label>
    `;
  }

  private renderImportActions(slug: string, merging: boolean) {
    const waiting = this.review;
    if (waiting !== null) {
      return html`
        <div class="actions">
          <button
            @click=${() => {
              this.answerReview(false);
            }}
          >
            Cancel
          </button>
          <button
            class="primary"
            @click=${() => {
              this.answerReview(true);
            }}
          >
            ${waiting.review.unreadable === null ? 'Merge' : 'Replace'}
          </button>
        </div>
      `;
    }
    return html`
      <div class="actions">
        <button @click=${this.cancelImport} ?disabled=${this.importing}>
          Cancel
        </button>
        <button
          class="primary"
          @click=${this.confirmImport}
          ?disabled=${this.importing || slug === ''}
        >
          ${this.importing ? 'Importing…' : merging ? 'Continue' : 'Import'}
        </button>
      </div>
    `;
  }

  private renderImportButton() {
    return html`
      <div class="import-actions">
        <button
          class="import"
          ?disabled=${this.importing}
          @click=${this.onImportFileClick}
        >
          ${this.importing ? 'Importing…' : 'Import GEDCOM'}
        </button>
      </div>
    `;
  }

  override render() {
    return html`
      <input
        id="file-input"
        type="file"
        accept=".ged,.gedcom,.gdz"
        hidden
        @change=${this.onFileChange}
      />
      ${this.renderScreen()}
      ${renderRowMenu(this.menu, this.menuActions, () => {
        this.setMenu(null);
      })}
      ${this.renderImportDialog()}
      ${
        this.confirming === null
          ? nothing
          : confirmDialog(this.confirming, {
              cancel: this.cancelConfirm,
              confirm: () => {
                void this.runConfirmed();
              }
            })
      }
    `;
  }

  private renderScreen() {
    if (this.provider !== null) return this.renderDatasetView();
    // Settings renders before the dataset list arrives, so it's there from
    // the first paint rather than popping in over a blank page.
    return html`<sl-settings></sl-settings>${this.renderLanding()}`;
  }

  private renderLanding() {
    if (this.datasetsError !== null) {
      return html`<div class="center">
        <p>Couldn't load: ${this.datasetsError}</p>
      </div>`;
    }
    if (this.datasets === null) return nothing;
    if (this.datasets.length === 0) return this.renderEmpty();
    return this.renderChooser();
  }

  private renderEmpty() {
    return html`
      <div class="center">
        <h2>No datasets yet</h2>
        <p>
          Import a GEDCOM file, or a GEDZIP with its photos, to get started.
        </p>
        ${this.renderImportButton()}
      </div>
    `;
  }

  // The name goes to the Settings popover, beside its link back to the
  // chooser; the window's title names the dataset too (src/server/index.ts).
  private renderDatasetView() {
    const listed = this.datasets?.find((d) => d.slug === this.slug);
    return html`
      <sl-tree-view
        .datasetName=${listed?.displayName ?? this.slug}
      ></sl-tree-view>
    `;
  }

  private renderReimport(d: DatasetInfo) {
    return html`<button
      class="import"
      ?disabled=${this.importing}
      @click=${() => {
        this.reimport(d);
      }}
    >
      Import…
    </button>`;
  }

  private renderChooser() {
    return html`
      <div class="page">
        <div class="page-head">
          <h2>Datasets</h2>
          ${this.renderImportButton()}
        </div>
        ${this.renderExportNote()}
        <ul class="chooser">
          ${this.datasets!.map(
            (d) => html`
              <li>
                ${d.outdated ? renderOutdated(d) : renderLink(d)}
                <div class="row-actions">
                  ${d.outdated ? this.renderReimport(d) : nothing}
                  ${menuButton(d, this.menu, this, this.setMenu)}
                  <button
                    class="icon delete"
                    aria-label=${`Delete ${d.displayName}`}
                    @click=${() => {
                      this.request('delete', d);
                    }}
                  >
                    ${TRASH_ICON}
                  </button>
                </div>
              </li>
            `
          )}
        </ul>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-app': AppElement;
  }
}
