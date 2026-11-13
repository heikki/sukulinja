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

// A Fact's form open in its place, by its id, or a new one's.
type Editing = number | 'new' | null;

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says, dimmed while no source
// supports it. Clicking one picks it, showing its sources under it; a
// second click opens it for editing in its place, and _Add event_
// opens a new one below; one at a time. A source supporting it (ADR-0022)
// opens in the Scan viewer; one with nothing to open there is asked for in
// Sources, as `show-source` with its Citation's id.
@customElement('sl-person-events')
class PersonEventsElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personEventsStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) facts: FactRow[] = [];
  @property({ attribute: false }) marriages: Marriage[] = [];

  @state() private editing: Editing = null;
  // The Fact picked, by id: its sources and what can be done of it show
  // under it.
  @state() private picked: number | null = null;

  private readonly close = () => {
    this.editing = null;
  };

  private edit(fact: FactRow) {
    this.picked = null;
    this.editing = fact.id;
  }

  private openSource(source: Source) {
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

  // The person's sources, as Sources lists them.
  private sources() {
    return this.state.selected.sources.get().flatMap((g) => g.sources);
  }

  private renderForm(fact: FactRow | null) {
    return html`<sl-fact-form
      .fact=${fact}
      .marriages=${this.marriages}
      @closed=${this.close}
    ></sl-fact-form>`;
  }

  // Under the picked Fact: the sources supporting it, or that there's none.
  private renderPicked(sources: Source[]) {
    return html`<div class="picked">
      ${
        sources.length === 0
          ? html`<p class="none">No source supports it yet.</p>`
          : html`<ul class="sources">
              ${sources.map((source) => {
                const { citation: c, status } = source;
                const entry =
                  c.entry === null || c.citedPage !== null
                    ? ''
                    : `, ${c.entry}`;
                return html`<li>
                  <button
                    class="source"
                    @click=${() => {
                      this.openSource(source);
                    }}
                  >
                    ${titleText(c, status)}${entry}
                  </button>
                </li>`;
              })}
            </ul>`
      }
    </div>`;
  }

  // A Fact no source supports is dimmed, so the eye finds those that
  // still need one. Clicking picks it; clicked again, it opens for
  // editing, where it can be deleted. Esc lets it go.
  private renderFact(f: FactRow, sources: Source[]) {
    if (this.editing === f.id) return this.renderForm(f);
    const supporting = sourcesOf(f, sources);
    const picked = this.picked === f.id;
    return html`<button
        class="fact ${supporting.length === 0 ? 'unsourced' : ''}"
        aria-expanded=${picked ? 'true' : 'false'}
        title=${picked ? 'Edit' : nothing}
        @click=${() => {
          if (picked) this.edit(f);
          else this.picked = f.id;
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape' && picked) {
            e.preventDefault();
            e.stopPropagation();
            this.picked = null;
          }
        }}
      >
        <span class="kind">${factLabel(f)}</span>
        <span class="text">${factText(f)}</span>
      </button>
      ${picked ? this.renderPicked(supporting) : nothing}`;
  }

  override render() {
    const adding = this.editing === 'new';
    const sources = this.sources();
    return html`<div class="facts">
        ${this.facts.map((f) => this.renderFact(f, sources))}
      </div>
      ${
        adding
          ? this.renderForm(null)
          : html`<button
              class="add"
              @click=${() => {
                this.picked = null;
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
