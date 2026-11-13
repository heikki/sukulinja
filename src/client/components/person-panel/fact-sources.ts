import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow, SupportSuggestion } from '@/common/types';

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

// A source whose Transcription suggests it supports the Fact.
interface Suggested {
  source: Source;
  suggestion: SupportSuggestion;
}

// Under a picked Fact in Events: the sources supporting it (ADR-0022), or
// that there's none, then those whose Transcription suggests they do, with
// what it says and whether that differs, each to confirm. A source opens
// in the Scan viewer; one with nothing to open there is asked for in
// Sources, as `show-source` with its Citation's id.
@customElement('sl-fact-sources')
class FactSourcesElement extends LitElement {
  static override styles = [
    focusRingStyles,
    css`
      :host {
        display: block;
        font-size: 0.85rem;
      }

      /* In the text's column when Events lays it on the Facts' columns. */
      p,
      ul {
        grid-column: 2;
      }

      ul {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .none,
      .label {
        margin: 0;
        color: var(--muted);
      }

      .label {
        margin-top: 0.3rem;
      }

      button {
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      button:hover:not(:disabled) {
        text-decoration: underline;
      }

      button:disabled {
        color: var(--muted);
        cursor: default;
      }

      button.source::before {
        content: '↳ ';
      }

      .says {
        color: var(--muted);
      }

      .says.differs {
        color: var(--caution);
      }

      button.confirm {
        margin-left: 0.4rem;
        font-weight: 500;
      }

      .error {
        margin: 0.3rem 0 0;
        color: var(--danger);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) fact!: FactRow;
  @property({ attribute: false }) facts: FactRow[] = [];
  // The person's sources, as Sources lists them.
  @property({ attribute: false }) sources: Source[] = [];

  // The Citation whose suggestion is being confirmed, and why the last
  // was refused.
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

  private suggested(): Suggested[] {
    return this.sources.flatMap((source) => {
      const suggestion = openSuggestions(source.citation, this.facts).find(
        (s) => s.factId === this.fact.id
      );
      return suggestion === undefined ? [] : [{ source, suggestion }];
    });
  }

  private async confirm(citationId: number) {
    if (this.saving !== null) return;
    this.saving = citationId;
    this.refused = null;
    try {
      await this.state.selected.support(citationId, this.fact.id, true);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = null;
    }
  }

  private renderSource(source: Source) {
    return html`<button
      class="source"
      @click=${() => {
        this.open(source);
      }}
    >
      ${sourceName(source)}
    </button>`;
  }

  private renderSuggested({ source, suggestion: s }: Suggested) {
    const differs = s.agrees === false;
    return html`<li>
      ${this.renderSource(source)}
      <span class="says ${differs ? 'differs' : ''}"
        >· says ${s.says}${differs ? ', differs' : ''}</span
      >
      <button
        class="confirm"
        ?disabled=${this.saving !== null}
        @click=${() => {
          void this.confirm(source.citation.id);
        }}
      >
        Confirm
      </button>
    </li>`;
  }

  override render() {
    const supporting = sourcesOf(this.fact, this.sources);
    const suggested = this.suggested();
    return html`
      ${
        supporting.length === 0
          ? html`<p class="none">No source supports it yet.</p>`
          : html`<ul>
              ${supporting.map((s) => html`<li>${this.renderSource(s)}</li>`)}
            </ul>`
      }
      ${
        suggested.length === 0
          ? nothing
          : html`<p class="label">Suggested</p>
              <ul>
                ${suggested.map((s) => this.renderSuggested(s))}
              </ul>`
      }
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
