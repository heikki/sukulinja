import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { CitationRow, FactRow, SupportSuggestion } from '@/common/types';

import { factBrief, openSuggestions } from './helpers';
import { citationSupportsStyles } from './supports-styles';

// Which of the person's Facts a source's Citation supports (ADR-0022): a
// toggle for each, pressed for those it does, and marked for those its
// Transcription suggests, with what it says when that differs. Each press
// is saved as it's made, and says why when the app refuses it.
function suggestionTitle(s: SupportSuggestion) {
  const agrees =
    s.agrees === true ? '' : s.agrees === false ? ', which differs' : '';
  return `Suggested: the transcription gives ${s.says}${agrees}`;
}

@customElement('sl-citation-supports')
class CitationSupportsElement extends LitElement {
  static override styles = [focusRingStyles, citationSupportsStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) citation!: CitationRow;
  @property({ attribute: false }) facts: FactRow[] = [];

  // The Fact whose press is being saved, and why the last was refused.
  @state() private saving: number | null = null;
  @state() private refused: string | null = null;

  private async toggle(fact: FactRow, on: boolean) {
    if (this.saving !== null) return;
    this.saving = fact.id;
    this.refused = null;
    try {
      await this.state.selected.support(this.citation.id, fact.id, on);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.refused = err.message;
    } finally {
      this.saving = null;
    }
  }

  override render() {
    if (this.facts.length === 0) return nothing;
    const { supports } = this.citation;
    const suggested = openSuggestions(this.citation, this.facts);
    return html`
      <div class="label" id="label">Supports</div>
      <div class="facts" role="group" aria-labelledby="label">
        ${this.facts.map((f) => {
          const on = supports.includes(f.id);
          const s = suggested.find((x) => x.factId === f.id);
          return html`<button
            class=${s === undefined ? nothing : 'suggested'}
            title=${s === undefined ? nothing : suggestionTitle(s)}
            aria-pressed=${on ? 'true' : 'false'}
            ?disabled=${this.saving !== null}
            @click=${() => {
              void this.toggle(f, !on);
            }}
          >
            ${factBrief(f)}${
              s?.agrees === false
                ? html`<span class="says"> · says ${s.says}</span>`
                : nothing
            }
          </button>`;
        })}
      </div>
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
    'sl-citation-supports': CitationSupportsElement;
  }
}
