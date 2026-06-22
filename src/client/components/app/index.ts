import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '../tree-view';

import { slugFromFilename } from '@common/slug';
import type { DatasetInfo } from '@common/types';

import { folderOf, relativeToBase, stripExtension } from './helpers';
import type { UploadMedia } from './helpers';
import { appStyles } from './styles';

type ImportEvent =
  | { type: 'log'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; info: DatasetInfo };

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?=\/|$)/u;

function currentSlug(): string | null {
  const m = DATASET_RE.exec(window.location.pathname);
  return m === null ? null : m.groups!.slug!;
}

@customElement('sl-app')
export class AppElement extends LitElement {
  static override styles = appStyles;

  @state() private datasets: DatasetInfo[] | null = null;
  @state() private readonly slug: string | null = currentSlug();
  @state() private pendingImport: File | null = null;
  @state() private pendingMedia: UploadMedia[] = [];
  @state() private importNameInput = '';
  @state() private importing = false;
  @state() private importStatus: string | null = null;
  @state() private importError: string | null = null;
  @state() private pendingDelete: DatasetInfo | null = null;
  @state() private deleting = false;
  @state() private deleteError: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadDatasets();
  }

  private async loadDatasets() {
    const res = await fetch('/datasets');
    this.datasets = (await res.json()) as DatasetInfo[];
  }

  // Import a single GEDCOM file (no local media; MyHeritage URL media still
  // downloads server-side).
  private readonly onImportFileClick = () => {
    this.renderRoot.querySelector<HTMLInputElement>('#file-input')?.click();
  };

  // Import a whole folder: the GEDCOM plus its sibling image directories.
  private readonly onImportFolderClick = () => {
    this.renderRoot.querySelector<HTMLInputElement>('#folder-input')?.click();
  };

  private readonly onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    this.openImportDialog(file, [], stripExtension(file.name));
  };

  // A folder upload carries the GEDCOM's sibling media so local FILE references
  // resolve. Find the .ged, then ship every other file relative to its folder.
  private readonly onFolderChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const all = input.files === null ? [] : Array.from(input.files);
    input.value = '';
    if (all.length === 0) return;
    const ged = all.find((f) => /\.ged(?:com)?$/iu.test(f.name));
    if (ged === undefined) {
      this.importError = 'No .ged or .gedcom file found in that folder.';
      return;
    }
    const base = folderOf(ged.webkitRelativePath);
    const media: UploadMedia[] = [];
    for (const f of all) {
      if (f === ged) continue;
      const relPath = relativeToBase(f.webkitRelativePath, base);
      if (relPath !== null) media.push({ file: f, relPath });
    }
    const defaultName = base === '' ? stripExtension(ged.name) : base;
    this.openImportDialog(ged, media, defaultName);
  };

  private openImportDialog(file: File, media: UploadMedia[], name: string) {
    this.pendingImport = file;
    this.pendingMedia = media;
    this.importNameInput = name;
    this.importStatus = null;
    this.importError = null;
  }

  private readonly onImportNameInput = (e: Event) => {
    this.importNameInput = (e.target as HTMLInputElement).value;
  };

  private readonly onImportKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') this.confirmImport();
  };

  private readonly cancelImport = () => {
    if (this.importing) return;
    this.pendingImport = null;
    this.pendingMedia = [];
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
      for (const m of this.pendingMedia) {
        body.append('media', m.file);
        body.append('mediaPath', m.relPath);
      }
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
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done: DatasetInfo | null = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- the stream is read sequentially, one chunk at a time
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
        stream: !chunk.done
      });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line !== '') {
          const event = JSON.parse(line) as ImportEvent;
          if (event.type === 'log') this.importStatus = event.message;
          else if (event.type === 'error') this.importError = event.message;
          else done = event.info;
        }
        nl = buffer.indexOf('\n');
      }
      if (chunk.done) break;
    }
    return done;
  }

  private readonly requestDelete = (dataset: DatasetInfo) => {
    this.pendingDelete = dataset;
    this.deleteError = null;
  };

  private readonly cancelDelete = () => {
    if (this.deleting) return;
    this.pendingDelete = null;
  };

  private readonly confirmDelete = async () => {
    const target = this.pendingDelete;
    if (target === null) return;
    this.deleting = true;
    this.deleteError = null;
    try {
      const res = await fetch(`/datasets/${target.slug}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await res.text();
        this.deleteError = msg === '' ? `delete failed (${res.status})` : msg;
        return;
      }
      this.pendingDelete = null;
      if (target.slug === this.slug) {
        window.location.assign('/');
        return;
      }
      await this.loadDatasets();
    } catch (err) {
      this.deleteError = err instanceof Error ? err.message : 'delete failed';
    } finally {
      this.deleting = false;
    }
  };

  private renderImportDialog() {
    const file = this.pendingImport;
    if (file === null) return nothing;
    const slug = slugFromFilename(this.importNameInput);
    return html`
      <div class="overlay" @click=${this.cancelImport}>
        <div
          class="dialog"
          role="dialog"
          @click=${(e: Event) => {
            e.stopPropagation();
          }}
        >
          <h2>Import dataset</h2>
          <p class="muted">
            From <code>${file.name}</code>${this.pendingMedia.length > 0
              ? ` + ${this.pendingMedia.length} media file${
                  this.pendingMedia.length === 1 ? '' : 's'
                }`
              : nothing}
          </p>
          <label class="field">
            Name
            <input
              type="text"
              .value=${this.importNameInput}
              ?disabled=${this.importing}
              @input=${this.onImportNameInput}
              @keydown=${this.onImportKeydown}
            />
          </label>
          <p class="muted">Saved as <code>${slug === '' ? '…' : slug}</code></p>
          ${this.importing && this.importStatus !== null
            ? html`<p class="muted">${this.importStatus}</p>`
            : nothing}
          ${this.importError === null
            ? nothing
            : html`<p class="error">${this.importError}</p>`}
          <div class="actions">
            <button @click=${this.cancelImport} ?disabled=${this.importing}>
              Cancel
            </button>
            <button
              class="primary"
              @click=${this.confirmImport}
              ?disabled=${this.importing || slug === ''}
            >
              ${this.importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderImportButton() {
    return html`
      <button
        class="import"
        ?disabled=${this.importing}
        @click=${this.onImportFileClick}
      >
        ${this.importing ? 'Importing…' : 'Import GEDCOM file'}
      </button>
      <button
        class="import"
        ?disabled=${this.importing}
        title="Pick a folder containing the GEDCOM and its image folders"
        @click=${this.onImportFolderClick}
      >
        Import GEDCOM folder
      </button>
    `;
  }

  override render() {
    return html`
      <input
        id="file-input"
        type="file"
        accept=".ged,.gedcom"
        hidden
        @change=${this.onFileChange}
      />
      <input
        id="folder-input"
        type="file"
        webkitdirectory
        hidden
        @change=${this.onFolderChange}
      />
      ${this.renderScreen()} ${this.renderImportDialog()}
      ${this.renderDeleteDialog()}
    `;
  }

  private renderDeleteDialog() {
    const target = this.pendingDelete;
    if (target === null) return nothing;
    return html`
      <div class="overlay" @click=${this.cancelDelete}>
        <div
          class="dialog"
          role="alertdialog"
          @click=${(e: Event) => {
            e.stopPropagation();
          }}
        >
          <h2>Delete dataset?</h2>
          <p>
            <strong>${target.displayName}</strong> (${target.personCount}
            people) will be permanently removed. This can't be undone.
          </p>
          ${this.deleteError === null
            ? nothing
            : html`<p class="error">${this.deleteError}</p>`}
          <div class="actions">
            <button @click=${this.cancelDelete} ?disabled=${this.deleting}>
              Cancel
            </button>
            <button
              class="danger"
              @click=${this.confirmDelete}
              ?disabled=${this.deleting}
            >
              ${this.deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderScreen() {
    if (this.slug !== null) return this.renderDatasetView();
    if (this.datasets === null) return nothing;
    if (this.datasets.length === 0) return this.renderEmpty();
    return this.renderChooser();
  }

  private renderEmpty() {
    return html`
      <header><h1>Sukulinja</h1></header>
      <div class="center">
        <h2>No datasets yet</h2>
        <p>Import a MyHeritage (or any) GEDCOM file to get started.</p>
        ${this.renderImportButton()}
        <p class="muted">
          Or from a terminal:
          <code>bun run import-ged path/to/family.ged</code>
        </p>
      </div>
    `;
  }

  private renderDatasetView() {
    const current = this.datasets?.find((d) => d.slug === this.slug);
    const name = current?.displayName ?? this.slug ?? '';
    // The dataset name lives in the tree-view's own toolbar (slot="brand"),
    // standing in for "Sukulinja" and doubling as the link back to the chooser.
    return html`
      <sl-tree-view>
        <button
          slot="brand"
          class="brand"
          title="Back to datasets"
          @click=${() => {
            window.location.assign('/');
          }}
        >
          Sukulinja · ${name}
        </button>
      </sl-tree-view>
    `;
  }

  private renderChooser() {
    return html`
      <header><h1>Sukulinja</h1></header>
      <div class="center">
        <h2>Pick a dataset</h2>
        <ul class="chooser">
          ${this.datasets!.map(
            (d) => html`
              <li>
                <a href=${`/d/${d.slug}/`}>
                  ${d.displayName}
                  <div class="muted">
                    ${d.personCount} people · ${d.familyCount} families
                  </div>
                </a>
                <button
                  class="delete"
                  title="Delete dataset"
                  @click=${() => {
                    this.requestDelete(d);
                  }}
                >
                  Delete
                </button>
              </li>
            `
          )}
        </ul>
        <p style="margin-top: 1.5rem">${this.renderImportButton()}</p>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-app': AppElement;
  }
}
