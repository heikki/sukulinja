import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow, Marriage } from '@/common/types';

import './fact-form';
import './fact-sources';

import { personEventsStyles } from './events-styles';
import { factLabel, factText, sourcesOf, viewFromEvents } from './helpers';

// A Fact's form open in its place, by its id, or a new one's.
type Editing = number | 'new' | null;

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says, dimmed while no source
// supports it. Clicking one picks it, opening its first source in the Scan
// viewer if that's open, and showing under it its sources and
// _Edit event_, which opens it for editing in its place (fact-sources.ts);
// clicked again it's let go. _Add event_ opens a new one below; one at a
// time.
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

  // It stays picked, so saving or cancelling comes back to it picked.
  private edit(fact: FactRow) {
    this.picked = fact.id;
    this.editing = fact.id;
  }

  // Picked while the Scan viewer is open, its first source is opened there.
  private pick(fact: FactRow, supporting: Source[]) {
    this.picked = fact.id;
    if (this.state.viewer.opened.get() === null) return;
    const [first] = supporting;
    if (first !== undefined) viewFromEvents(this, this.state, first);
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

  // A Fact no source supports is dimmed, so the eye finds those that
  // still need one. Clicking picks it, and again lets it go, as Esc does.
  private renderFact(f: FactRow, sources: Source[]) {
    if (this.editing === f.id) return this.renderForm(f);
    const supporting = sourcesOf(f, sources);
    const picked = this.picked === f.id;
    return html`<button
        class="fact ${supporting.length === 0 ? 'unsourced' : ''}"
        aria-expanded=${picked ? 'true' : 'false'}
        @click=${() => {
          if (picked) this.picked = null;
          else this.pick(f, supporting);
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
      ${
        picked
          ? html`<sl-fact-sources
              class="picked"
              .fact=${f}
              .facts=${this.facts}
              .sources=${sources}
              @edit-fact=${() => {
                this.edit(f);
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Escape' && !e.defaultPrevented) {
                  this.picked = null;
                }
              }}
            ></sl-fact-sources>`
          : nothing
      }`;
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
