import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow, SupportSuggestion } from '@/common/types';

import { factSourcesStyles } from './fact-sources-styles';
import {
  openSuggestions,
  sourcesOf,
  titleText,
  viewerOpening
} from './helpers';

// A source by the name Sources gives it, and where in its Volume it is
// unless its name says (a reference to a page).
function sourceName({ citation: c, status }: Source) {
  const entry = c.entry === null || c.citedPage !== null ? '' : `, ${c.entry}`;
  return `${titleText(c, status)}${entry}`;
}

// Under a picked Fact in Events: the sources supporting it (ADR-0022),
// each opened by a click (or that the person has none); then _Add source…_ or _Edit
// sources…_, which lists all the person's sources, each with a checkbox
// that adds or takes back its support, a Change each: those supporting it
// first, then those whose Transcription suggests they do, with what it says
// and whether that differs, then the rest. The order is kept while the list
// is open, so a row doesn't move from under the pointer. A source opens in
// the Scan viewer; one with nothing to open there is asked for in Sources,
// as `show-source` with its Citation's id.
@customElement('sl-fact-sources')
class FactSourcesElement extends LitElement {
  static override styles = factSourcesStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) fact!: FactRow;
  @property({ attribute: false }) facts: FactRow[] = [];
  // The person's sources, as Sources lists them.
  @property({ attribute: false }) sources: Source[] = [];

  // The sources listed for editing, by Citation id in the order they were
  // listed in when opened, or null when closed; the Citation whose support
  // is being saved, and why the last was refused.
  @state() private editing: number[] | null = null;
  @state() private saving: number | null = null;
  @state() private refused: string | null = null;

  private open(source: Source) {
    const opening = viewerOpening(source);
    if (opening !== null) {
      this.state.viewer.open(opening);
      return;
    }
    this.dispatchEvent(
      new CustomEvent('show-source', {
        detail: source.citation.id,
        bubbles: true,
        composed: true
      })
    );
  }

  private suggestionOf(source: Source): SupportSuggestion | null {
    return (
      openSuggestions(source.citation, this.facts).find(
        (s) => s.factId === this.fact.id
      ) ?? null
    );
  }

  private supports(source: Source) {
    return source.citation.supports.includes(this.fact.id);
  }

  // Supporting, suggested, the rest.
  private ordered() {
    const rank = (s: Source) => {
      if (this.supports(s)) return 0;
      return this.suggestionOf(s) === null ? 2 : 1;
    };
    return this.sources
      .map((s, i) => ({ s, i, r: rank(s) }))
      .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r - b.r))
      .map(({ s }) => s.citation.id);
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
    if (supporting.length === 0) {
      return this.sources.length === 0
        ? html`<p class="none">No sources yet.</p>`
        : nothing;
    }
    return html`<ul>
      ${supporting.map((s) => html`<li>${this.renderOpen(s, 'source')}</li>`)}
    </ul>`;
  }

  private renderEditable(source: Source) {
    const on = this.supports(source);
    const s = on ? null : this.suggestionOf(source);
    const differs = s?.agrees === false;
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
      <div>
        ${this.renderOpen(source, 'name')}
        ${
          s === null
            ? nothing
            : html`<span class="says ${differs ? 'differs' : ''}"
                >suggested · says ${s.says}${differs ? ', differs' : ''}</span
              >`
        }
      </div>
    </li>`;
  }

  private renderToggle(supporting: Source[]) {
    if (this.sources.length === 0) return nothing;
    const suggested = this.sources.filter(
      (s) => !this.supports(s) && this.suggestionOf(s) !== null
    ).length;
    const label = supporting.length === 0 ? 'Add source…' : 'Edit sources…';
    return html`<button
      class="toggle"
      aria-expanded=${this.editing === null ? 'false' : 'true'}
      @click=${() => {
        this.editing = this.editing === null ? this.ordered() : null;
      }}
    >
      ${label}${suggested === 0 ? '' : ` (${suggested} suggested)`}
    </button>`;
  }

  private renderEditing(ids: number[]) {
    const byId = new Map(this.sources.map((s) => [s.citation.id, s]));
    const listed = ids.flatMap((id) => byId.get(id) ?? []);
    return html`<ul class="editing">
      ${listed.map((s) => this.renderEditable(s))}
    </ul>`;
  }

  override render() {
    const supporting = sourcesOf(this.fact, this.sources);
    return html`
      ${this.editing === null ? this.renderSupporting(supporting) : nothing}
      ${this.renderToggle(supporting)}
      ${this.editing === null ? nothing : this.renderEditing(this.editing)}
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
