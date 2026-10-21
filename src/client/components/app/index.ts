import { ContextProvider } from '@lit/context';
import { html, LitElement, nothing, svg } from 'lit';
import type { ReactiveElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '../settings';
import '../tree-view';

import { NOT_RESPONDING, openDatasetApi } from '@client/dataset-api';
import { focusRingStyles } from '@client/focus-ring';
import { readNdjson } from '@client/ndjson';
import { appState, openAppState } from '@client/state';
import { slugFromFilename, withoutExtension } from '@common/slug';
import type { DatasetInfo, ImportReview } from '@common/types';

import { confirmDialog, errorNote, runAction } from './dialogs';
import type { Confirming, DatasetAction } from './dialogs';
import { importDate, renderReview } from './import-review';
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

type ImportEvent =
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'review'; id: string; review: ImportReview }
  | { type: 'cancelled' }
  | { type: 'done'; info: DatasetInfo };

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

@customElement('sl-app')
export class AppElement extends LitElement {
  static override styles = [focusRingStyles, appStyles];

  @state() private datasets: DatasetInfo[] | null = null;
  // Why the dataset list didn't load, in the app's words.
  @state() private datasetsError: string | null = null;
  @state() private readonly slug: string | null = currentSlug();
  // The dataset shown: its state, built over one API from its slug, and
  // provided to the screens below. A provider rather than `@provide`, whose
  // field can't be null, since the chooser has no dataset to provide.
  private readonly provider = provideDataset(this, currentSlug());
  @state() private pendingImport: File | null = null;
  @state() private exporting: string | null = null;
  // Where the last export was saved, or why it failed.
  @state() private exportNote: { ok: boolean; text: string } | null = null;
  // The name of an outdated dataset being imported again, so the import
  // replaces it.
  private reimportName: string | null = null;
  @state() private importNameInput = '';
  @state() private importing = false;
  @state() private importStatus: string | null = null;
  @state() private importError: string | null = null;
  // What importing into an existing dataset would change, waiting for
  // Merge or Cancel.
  @state() private review: { id: string; review: ImportReview } | null = null;
  // A dataset action waiting to be confirmed, or running.
  @state() private confirming: Confirming | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadDatasets();
  }

  // Worded as the Dataset API words its failures; an answer that isn't JSON
  // is a bug, so it still throws.
  private async loadDatasets() {
    const res = await fetch('/datasets').catch(() => null);
    if (res === null) {
      this.datasetsError = NOT_RESPONDING;
      return;
    }
    if (!res.ok) {
      const words = await res.text().catch(() => '');
      this.datasetsError =
        words === '' ? `datasets failed (${res.status})` : words;
      return;
    }
    this.datasets = (await res.json()) as DatasetInfo[];
    this.datasetsError = null;
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
      const body = new FormData();
      body.append('file', file);
      body.append('name', name);
      const res = await fetch('/import', { method: 'POST', body });
      if (!res.ok || res.body === null) {
        const msg = await res.text();
        this.importError = msg === '' ? `import failed (${res.status})` : msg;
        return;
      }
      const info = await this.consumeImportStream(res.body);
      if (info !== null) window.location.assign(`/d/${info.slug}/`);
    } catch (err) {
      this.importError = err instanceof Error ? err.message : 'import failed';
    } finally {
      this.importing = false;
      this.importStatus = null;
    }
  }

  // Read the newline-delimited JSON progress stream, updating the live status
  // line. Returns the imported dataset on success, or null after recording an
  // error event (the import streams 200 even when it ultimately fails).
  private async consumeImportStream(
    body: ReadableStream<Uint8Array>
  ): Promise<DatasetInfo | null> {
    let done: DatasetInfo | null = null;
    for await (const raw of readNdjson(body)) {
      const event = raw as ImportEvent;
      if (event.type === 'log') this.importStatus = event.message;
      else if (event.type === 'error') this.importError = event.message;
      else if (event.type === 'review') this.review = event;
      else if (event.type === 'cancelled') this.pendingImport = null;
      else done = event.info;
    }
    return done;
  }

  // Merge or Cancel the import waiting on its review; its stream then ends.
  private readonly answerReview = async (merge: boolean) => {
    const waiting = this.review;
    if (waiting === null) return;
    this.review = null;
    this.importStatus = merge ? 'Saving…' : 'Cancelling…';
    const res = await fetch(`/import/${waiting.id}`, {
      method: 'POST',
      body: JSON.stringify({ merge })
    }).catch(() => null);
    if (res?.ok !== true) this.importError = 'the import stopped waiting';
  };

  // Saved by the server, since the app's web view can't hand a download to
  // the user: into Downloads, which the note names.
  private readonly exportDataset = async (dataset: DatasetInfo) => {
    this.exporting = dataset.slug;
    this.exportNote = null;
    try {
      const res = await fetch(`/datasets/${dataset.slug}/export`, {
        method: 'POST'
      });
      if (!res.ok) {
        const msg = await res.text();
        this.exportNote = {
          ok: false,
          text: msg === '' ? `export failed (${res.status})` : msg
        };
        return;
      }
      const { path } = (await res.json()) as { path: string };
      this.exportNote = {
        ok: true,
        text: `Exported ${dataset.displayName} to ${path}`
      };
    } catch (err) {
      this.exportNote = {
        ok: false,
        text: err instanceof Error ? err.message : 'export failed'
      };
    } finally {
      this.exporting = null;
    }
  };

  private renderExportNote() {
    const note = this.exportNote;
    if (note === null) return nothing;
    return note.ok
      ? html`<p class="export-note">${note.text}</p>`
      : errorNote('Export failed', note.text);
  }

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
    const error = await runAction(c);
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
              void this.answerReview(false);
            }}
          >
            Cancel
          </button>
          <button
            class="primary"
            @click=${() => {
              void this.answerReview(true);
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
      ${this.renderScreen()} ${this.renderImportDialog()}
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

  // An older version's database doesn't open; the file it came from isn't
  // kept, so it's imported again, merging (ADR-0013).
  private renderOutdated(d: DatasetInfo) {
    return html`
      <div class="outdated">
        <span class="name">${d.displayName}</span>
        <span class="muted">
          Made by an older version. Import its GEDCOM again to open it; what the
          app added is kept.
        </span>
      </div>
      <button
        class="import"
        ?disabled=${this.importing}
        @click=${() => {
          this.reimport(d);
        }}
      >
        Import…
      </button>
    `;
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
                ${d.outdated ? this.renderOutdated(d) : renderLink(d)}
                ${
                  d.outdated
                    ? nothing
                    : html`<button
                        class="import"
                        ?disabled=${this.exporting !== null}
                        @click=${() => {
                          void this.exportDataset(d);
                        }}
                      >
                        ${this.exporting === d.slug ? 'Exporting…' : 'Export'}
                      </button>`
                }
                ${
                  d.undoable
                    ? html`<button
                        class="import"
                        @click=${() => {
                          this.request('undo', d);
                        }}
                      >
                        Undo last import (${importDate(d.importedAt)})
                      </button>`
                    : nothing
                }
                <button
                  class="delete"
                  aria-label=${`Delete ${d.displayName}`}
                  @click=${() => {
                    this.request('delete', d);
                  }}
                >
                  ${TRASH_ICON}
                </button>
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
