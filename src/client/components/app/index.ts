import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '../tree-view';

import type { DatasetInfo } from '@common/types';

import type { TreeViewElement } from '../tree-view';

const DATASET_RE = /^\/d\/(?<slug>[a-z0-9][a-z0-9_-]*)(?=\/|$)/u;

function currentSlug(): string | null {
  const m = DATASET_RE.exec(window.location.pathname);
  return m === null ? null : m.groups!.slug!;
}

@customElement('sl-app')
export class AppElement extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      border-bottom: 1px solid var(--border);
      background: var(--card);
    }
    h1 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      cursor: pointer;
      user-select: none;
    }
    .toolbar {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    select {
      padding: 0.25rem 0.5rem;
      background: var(--card);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      font: inherit;
    }
    .center {
      max-width: 32rem;
      margin: 4rem auto;
      padding: 1.5rem;
      text-align: center;
    }
    .center h2 {
      margin: 0 0 0.5rem;
      font-size: 1.3rem;
    }
    .center p {
      color: var(--muted);
      margin: 0 0 1.5rem;
    }
    .center code {
      background: var(--bg);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid var(--border);
    }
    ul.chooser {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.5rem;
    }
    ul.chooser a {
      display: block;
      padding: 0.75rem 1rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--fg);
      text-decoration: none;
    }
    ul.chooser a:hover {
      border-color: var(--accent);
    }
    .muted {
      color: var(--muted);
      font-size: 0.85em;
    }
    button.import {
      padding: 0.25rem 0.75rem;
      background: var(--card);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      font: inherit;
      cursor: pointer;
    }
    button.import:hover:not(:disabled) {
      border-color: var(--accent);
    }
    button.import:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .error {
      color: #c0392b;
      font-size: 0.85em;
      margin-top: 0.75rem;
    }
  `;

  @state() private datasets: DatasetInfo[] | null = null;
  @state() private readonly slug: string | null = currentSlug();
  @state() private importing = false;
  @state() private importError: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadDatasets();
  }

  private async loadDatasets() {
    const res = await fetch('/datasets');
    const list = (await res.json()) as DatasetInfo[];
    this.datasets = list;
    if (this.slug === null && list.length === 1) {
      window.location.replace(`/d/${list[0]!.slug}/`);
    }
  }

  private readonly onSwitcherChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const next = target.value;
    if (next !== '' && next !== this.slug) {
      window.location.assign(`/d/${next}/`);
    }
  };

  private readonly onTitleClick = () => {
    this.renderRoot
      .querySelector<TreeViewElement>('sl-tree-view')
      ?.resetFocus();
  };

  private readonly onImportClick = () => {
    this.renderRoot
      .querySelector<HTMLInputElement>('input[type=file]')
      ?.click();
  };

  private readonly onFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file !== undefined) void this.importFile(file);
  };

  private async importFile(file: File) {
    this.importing = true;
    this.importError = null;
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/import', { method: 'POST', body });
      if (!res.ok) {
        const msg = await res.text();
        this.importError = msg === '' ? `import failed (${res.status})` : msg;
        return;
      }
      const info = (await res.json()) as DatasetInfo;
      window.location.assign(`/d/${info.slug}/`);
    } catch (err) {
      this.importError = err instanceof Error ? err.message : 'import failed';
    } finally {
      this.importing = false;
    }
  }

  private renderImportButton() {
    return html`<button
      class="import"
      ?disabled=${this.importing}
      @click=${this.onImportClick}
    >
      ${this.importing ? 'Importing…' : 'Import GEDCOM'}
    </button>`;
  }

  override render() {
    return html`
      <input
        type="file"
        accept=".ged,.gedcom"
        hidden
        @change=${this.onFileChange}
      />
      ${this.renderScreen()}
    `;
  }

  private renderScreen() {
    if (this.slug !== null) return this.renderDatasetView();
    if (this.datasets === null) return nothing;
    if (this.datasets.length === 0) return this.renderEmpty();
    if (this.datasets.length === 1) return nothing;
    return this.renderChooser();
  }

  private renderEmpty() {
    return html`
      <header><h1>Sukulinja</h1></header>
      <div class="center">
        <h2>No datasets yet</h2>
        <p>Import a MyHeritage (or any) GEDCOM file to get started.</p>
        ${this.renderImportButton()}
        ${this.importing
          ? html`<p class="muted">
              Importing… this can take a minute while photos download.
            </p>`
          : nothing}
        ${this.importError === null
          ? nothing
          : html`<p class="error">${this.importError}</p>`}
        <p class="muted">
          Or from a terminal:
          <code>bun run import-ged path/to/family.ged</code>
        </p>
      </div>
    `;
  }

  private renderDatasetView() {
    return html`
      <header>
        <h1 @click=${this.onTitleClick}>Sukulinja</h1>
        <div class="toolbar">
          ${this.renderSwitcher()} ${this.renderImportButton()}
        </div>
      </header>
      <main><sl-tree-view></sl-tree-view></main>
    `;
  }

  private renderSwitcher() {
    const list = this.datasets;
    if (list === null || list.length < 2) return nothing;
    return html`
      <select @change=${this.onSwitcherChange}>
        ${list.map(
          (d) =>
            html`<option value=${d.slug} ?selected=${d.slug === this.slug}>
              ${d.displayName}
            </option>`
        )}
      </select>
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
              </li>
            `
          )}
        </ul>
        <p style="margin-top: 1.5rem">${this.renderImportButton()}</p>
        ${this.importError === null
          ? nothing
          : html`<p class="error">${this.importError}</p>`}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-app': AppElement;
  }
}
