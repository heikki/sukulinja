import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { appState, isMarked } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow } from '@/common/types';

import { factSourcesStyles } from './fact-sources-styles';
import { sourcesOf, titleText } from './helpers';

// A source by the name Sources gives it, and where in its Volume it is
// unless its name says (a reference to a page).
function sourceName({ citation: c, status }: Source) {
  const entry = c.entry === null || c.citedPage !== null ? '' : `, ${c.entry}`;
  return `${titleText(c, status)}${entry}`;
}

// Where a source goes among the others: by its Volume's archive, then as
// Astia lists the archive's Volumes, by reference code ("I Aa:12 Pää- ja
// rippikirjat …"), as Church books does; one with no Link after them, by
// the name before its first year (a Book's kind), then that year, as a
// village or a page may follow the years.
function sortKey(source: Source): [string, number, string, number] {
  const link = source.status?.link ?? null;
  if (link !== null) return [link.archive ?? '', 0, link.volume, 0];
  const name = sourceName(source);
  const m = /^(?<kind>.*?)(?<year>1[5-9]\d\d)/u.exec(name)?.groups;
  const year = m === undefined ? 0 : Number(m.year);
  return ['\u{10FFFF}', 1, (m?.kind ?? name).trim(), year];
}

function text(a: string, b: string) {
  return a.localeCompare(b, 'fi', { numeric: true });
}

function compareKeys(
  [archiveA, rankA, nameA, yearA]: ReturnType<typeof sortKey>,
  [archiveB, rankB, nameB, yearB]: ReturnType<typeof sortKey>
) {
  if (archiveA !== archiveB) return text(archiveA, archiveB);
  if (rankA !== rankB) return rankA - rankB;
  if (nameA !== nameB) return text(nameA, nameB);
  return yearA - yearB;
}

// Under a picked Fact in Events: the sources supporting it (ADR-0022),
// each opened by a click; then _Edit event_, asking Events for its form as
// `edit-fact`, and _Add source_ or _Edit sources_, which lists the
// person's Marked sources (`isMarked`: not a Match or an Estimate) and any
// still supporting the Fact, so it can be taken back, each with a checkbox
// that adds or takes back its support, a Change each, in Astia's order
// (`sortKey`). A source opens in the Scan viewer; one with nothing to open
// there is asked for in Sources, as `show-source` with its Citation's id;
// one opened there doesn't bring Sources to it. Esc closes the list.
@customElement('sl-fact-sources')
class FactSourcesElement extends LitElement {
  static override styles = factSourcesStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) fact!: FactRow;
  // The person's sources, as Sources lists them.
  @property({ attribute: false }) sources: Source[] = [];

  // Listing the sources to check; the Citation whose support is being
  // saved, and why the last was refused.
  @state() private editing = false;
  @state() private saving: number | null = null;
  @state() private refused: string | null = null;

  // Esc closes the list, wherever the focus is (WKWebView doesn't focus a
  // clicked button or checkbox): heard here first, so Events doesn't also
  // let the Fact go, and on the document, before the Scan viewer's on the
  // window. Marked handled, or WKWebView hands it on to macOS, which beeps.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.editing) return;
    e.preventDefault();
    e.stopPropagation();
    this.editing = false;
    void this.updateComplete.then(() => {
      this.renderRoot.querySelector<HTMLElement>('button.toggle')?.focus();
    });
  };

  constructor() {
    super();
    this.addEventListener('keydown', this.onKeyDown);
  }

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private open(source: Source) {
    if (this.state.viewer.openSource(source, { reveal: false })) return;
    this.dispatchEvent(
      new CustomEvent('show-source', {
        detail: source.citation.id,
        bubbles: true,
        composed: true
      })
    );
  }

  private supports(source: Source) {
    return source.citation.supports.includes(this.fact.id);
  }

  // The sources _Edit sources_ lists.
  private listed() {
    return this.sources.filter((s) => this.supports(s) || isMarked(s));
  }

  private async support(citationId: number, on: boolean) {
    if (this.saving !== null) return;
    this.saving = citationId;
    this.refused = null;
    try {
      await this.state.selected.support(citationId, this.fact.id, on);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = null;
    }
  }

  private renderOpen(source: Source, cls: string) {
    return html`<button
      class=${cls}
      @click=${() => {
        this.open(source);
      }}
    >
      ${sourceName(source)}
    </button>`;
  }

  private renderSupporting(supporting: Source[]) {
    if (supporting.length === 0) return nothing;
    return html`<ul>
      ${supporting.map((s) => html`<li>${this.renderOpen(s, 'source')}</li>`)}
    </ul>`;
  }

  private renderEditable(source: Source) {
    const on = this.supports(source);
    return html`<li>
      <input
        type="checkbox"
        aria-label=${`${sourceName(source)} supports it`}
        .checked=${on}
        ?disabled=${this.saving !== null}
        @change=${(e: Event) => {
          const box = e.target as HTMLInputElement;
          void this.support(source.citation.id, box.checked);
        }}
      />
      ${this.renderOpen(source, 'name')}
    </li>`;
  }

  private renderEdit() {
    return html`<button
      class="edit"
      @click=${() => {
        this.dispatchEvent(
          new CustomEvent('edit-fact', { bubbles: true, composed: true })
        );
      }}
    >
      Edit event
    </button>`;
  }

  private renderToggle(supporting: Source[]) {
    if (this.sources.length === 0) return nothing;
    const label = supporting.length === 0 ? 'Add source' : 'Edit sources';
    return html`<button
      class="toggle"
      aria-expanded=${this.editing ? 'true' : 'false'}
      @click=${() => {
        this.editing = !this.editing;
      }}
    >
      ${label}
    </button>`;
  }

  private renderEditing() {
    const sorted = this.listed().toSorted((a, b) =>
      compareKeys(sortKey(a), sortKey(b))
    );
    if (sorted.length === 0) {
      return html`<p class="none">No marked sources yet</p>`;
    }
    return html`<ul class="editing">
      ${sorted.map((s) => this.renderEditable(s))}
    </ul>`;
  }

  override render() {
    const supporting = sourcesOf(this.fact, this.sources);
    return html`
      ${this.editing ? nothing : this.renderSupporting(supporting)}
      <div class="actions">
        ${this.renderEdit()} ${this.renderToggle(supporting)}
      </div>
      ${this.editing ? this.renderEditing() : nothing}
      ${
        this.refused === null
          ? nothing
          : html`<p class="error">${this.refused}</p>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-fact-sources': FactSourcesElement;
  }
}
