import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow, SupportSuggestion } from '@/common/types';

import '../context-menu';

import type { MenuItem } from '../context-menu';
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

// A source that doesn't support the Fact yet, and what its Transcription
// says of the Fact if it suggests it does.
interface Addable {
  source: Source;
  suggestion: SupportSuggestion | null;
}

// Under a picked Fact in Events: the sources supporting it (ADR-0022), or
// that there's none, each opened by a click and taken back from its
// right-click menu; then _Add source…_, which
// lists the person's other sources to add, those whose Transcription
// suggests they support it first, with what it says and whether that
// differs. A source opens in the Scan viewer; one with nothing to open
// there is asked for in Sources, as `show-source` with its Citation's id.
// Each support added or taken back is a Change.
@customElement('sl-fact-sources')
class FactSourcesElement extends LitElement {
  static override styles = factSourcesStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) fact!: FactRow;
  @property({ attribute: false }) facts: FactRow[] = [];
  // The person's sources, as Sources lists them.
  @property({ attribute: false }) sources: Source[] = [];

  // Listing the sources to add; the Citation whose support is being
  // saved, and why the last was refused.
  @state() private adding = false;
  // The supporting source a right-click opened the menu for, and where.
  @state() private menu: { source: Source; at: Point } | null = null;
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

  // The sources not supporting the Fact, the suggested first.
  private addable(): Addable[] {
    const all = this.sources.flatMap((source): Addable[] => {
      if (source.citation.supports.includes(this.fact.id)) return [];
      const suggestion =
        openSuggestions(source.citation, this.facts).find(
          (s) => s.factId === this.fact.id
        ) ?? null;
      return [{ source, suggestion }];
    });
    return [
      ...all.filter((a) => a.suggestion !== null),
      ...all.filter((a) => a.suggestion === null)
    ];
  }

  private async support(citationId: number, on: boolean) {
    if (this.saving !== null) return;
    this.saving = citationId;
    this.refused = null;
    try {
      await this.state.selected.support(citationId, this.fact.id, on);
      if (on) this.adding = false;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = null;
    }
  }

  // The menu opens in Events, the element it's positioned in, kept inside
  // it rather than this short list.
  private openMenu(source: Source, e: MouseEvent) {
    e.preventDefault();
    const root = this.getRootNode();
    const host = root instanceof ShadowRoot ? root.host : this;
    const box = host.getBoundingClientRect();
    this.menu = {
      source,
      at: { x: e.clientX - box.left, y: e.clientY - box.top }
    };
  }

  private renderMenu() {
    const { menu } = this;
    if (menu === null) return nothing;
    const items: MenuItem[] = [
      {
        label: 'Remove as source',
        run: () => {
          void this.support(menu.source.citation.id, false);
        }
      }
    ];
    return html`<sl-context-menu
      .items=${items}
      .at=${menu.at}
      @close=${() => {
        this.menu = null;
      }}
    ></sl-context-menu>`;
  }

  private renderSupporting(source: Source) {
    return html`<li>
      <button
        class="source"
        aria-haspopup="menu"
        @click=${() => {
          this.open(source);
        }}
        @contextmenu=${(e: MouseEvent) => {
          this.openMenu(source, e);
        }}
      >
        ${sourceName(source)}
      </button>
    </li>`;
  }

  private renderAddable({ source, suggestion: s }: Addable) {
    const differs = s?.agrees === false;
    return html`<li>
      <button
        class="add-one"
        ?disabled=${this.saving !== null}
        @click=${() => {
          void this.support(source.citation.id, true);
        }}
      >
        ${sourceName(source)}
      </button>
      ${
        s === null
          ? nothing
          : html`<span class="says ${differs ? 'differs' : ''}"
              >suggested · says ${s.says}${differs ? ', differs' : ''}</span
            >`
      }
    </li>`;
  }

  private renderAdd(addable: Addable[]) {
    if (addable.length === 0) return nothing;
    const suggested = addable.filter((a) => a.suggestion !== null).length;
    return html`<button
        class="add"
        aria-expanded=${this.adding ? 'true' : 'false'}
        @click=${() => {
          this.adding = !this.adding;
        }}
      >
        Add source…${suggested === 0 ? '' : ` (${suggested} suggested)`}
      </button>
      ${
        this.adding
          ? html`<ul class="addable">
              ${addable.map((a) => this.renderAddable(a))}
            </ul>`
          : nothing
      }`;
  }

  override render() {
    const supporting = sourcesOf(this.fact, this.sources);
    return html`
      ${
        supporting.length === 0
          ? html`<p class="none">No source supports it yet.</p>`
          : html`<ul>
              ${supporting.map((s) => this.renderSupporting(s))}
            </ul>`
      }
      ${this.renderAdd(this.addable())} ${this.renderMenu()}
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
