import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow, Marriage } from '@/common/types';

import './fact-form';

import { personEventsStyles } from './events-styles';
import {
  factLabel,
  factText,
  sourcesOf,
  titleText,
  viewerOpening
} from './helpers';

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says, and under it the
// sources supporting it (ADR-0022), shown only for the Fact pointed at or
// focused, so the list stays quiet. Clicking one opens it for editing in
// its place, and _Add event_ opens a new one below; one at a time.
// Picking a source opens it in the Scan viewer; one with nothing to open
// there is asked for in Sources, as `show-source` with its Citation's id.
@customElement('sl-person-events')
class PersonEventsElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personEventsStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) facts: FactRow[] = [];
  @property({ attribute: false }) marriages: Marriage[] = [];

  // The Fact open in its form, by id, or a new one's.
  @state() private editing: number | 'new' | null = null;

  private readonly close = () => {
    this.editing = null;
  };

  private renderForm(fact: FactRow | null) {
    return html`<sl-fact-form
      .fact=${fact}
      .marriages=${this.marriages}
      @closed=${this.close}
    ></sl-fact-form>`;
  }

  // The Fact's sources, by the name Sources gives them and where in their
  // Volume they are.
  private renderSources(sources: Source[]) {
    if (sources.length === 0) return nothing;
    return html`<ul class="sources">
      ${sources.map((source) => {
        const { citation: c, status } = source;
        // A reference to a page names the page already.
        const entry =
          c.entry === null || c.citedPage !== null ? '' : `, ${c.entry}`;
        const opening = viewerOpening(source);
        return html`<li>
          <button
            class="source"
            title=${opening === null ? 'Show in Sources' : 'Open the scan'}
            @click=${() => {
              if (opening !== null) {
                this.state.viewer.open(opening);
                return;
              }
              this.dispatchEvent(
                new CustomEvent('show-source', {
                  detail: c.id,
                  bubbles: true,
                  composed: true
                })
              );
            }}
          >
            ${titleText(c, status)}${entry}
          </button>
        </li>`;
      })}
    </ul>`;
  }

  private renderFact(f: FactRow, sources: Source[]) {
    if (this.editing === f.id) return this.renderForm(f);
    return html`<div class="row">
      <button
        class="fact"
        title="Edit"
        @click=${() => {
          this.editing = f.id;
        }}
      >
        <span class="kind">${factLabel(f)}</span>
        <span class="text">${factText(f)}</span>
      </button>
      ${this.renderSources(sourcesOf(f, sources))}
    </div>`;
  }

  override render() {
    const adding = this.editing === 'new';
    const sources = this.state.selected.sources.get().flatMap((g) => g.sources);
    return html`<div class="facts">
        ${this.facts.map((f) => this.renderFact(f, sources))}
      </div>
      ${
        adding
          ? this.renderForm(null)
          : html`<button
              class="add"
              @click=${() => {
                this.editing = 'new';
              }}
            >
              Add event
            </button>`
      }`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-events': PersonEventsElement;
  }
}
