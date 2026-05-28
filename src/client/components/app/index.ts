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

function renderEmpty() {
  return html`
    <header><h1>Sukulinja</h1></header>
    <div class="center">
      <h2>No datasets yet</h2>
      <p>Import a GEDCOM file to get started:</p>
      <p><code>bun run import-ged path/to/family.ged</code></p>
    </div>
  `;
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
    select {
      margin-left: auto;
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
  `;

  @state() private datasets: DatasetInfo[] | null = null;
  @state() private readonly slug: string | null = currentSlug();

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

  override render() {
    if (this.slug !== null) return this.renderDatasetView();
    if (this.datasets === null) return nothing;
    if (this.datasets.length === 0) return renderEmpty();
    if (this.datasets.length === 1) return nothing;
    return this.renderChooser();
  }

  private renderDatasetView() {
    return html`
      <header>
        <h1 @click=${this.onTitleClick}>Sukulinja</h1>
        ${this.renderSwitcher()}
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
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-app': AppElement;
  }
}
