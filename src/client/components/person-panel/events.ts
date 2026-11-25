import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Asking } from '@/client/asking';
import { focusRingStyles } from '@/client/focus-ring';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import { factKindLabel } from '@/common/facts';
import type { FactRow, Marriage } from '@/common/types';

import '../ask';
import '../context-menu';
import './fact-form';

import type { Ask } from '../ask';
import { personEventsStyles } from './events-styles';
import { factLabel, factText, sourcesOf } from './helpers';

// A Fact's form open, by its id, or a new one's.
type Editing = number | 'new' | null;

// A Fact's menu, where it was right-clicked in the window; with `deleting`,
// asking before it's deleted.
interface FactMenu {
  fact: FactRow;
  at: Point;
  deleting: boolean;
}

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says, dimmed while no source
// supports it. Clicking one opens its first source in the Scan viewer, or
// with nothing to open there, asks Sources for it as `show-source` with
// its Citation's id. A right-click offers _Edit_, opening it in a modal,
// and _Delete_, asked first. _Add event_ opens a new one's; one at a
// time. Which sources support a Fact is set from an Entry's card
// (ADR-0033).
@customElement('sl-person-events')
class PersonEventsElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personEventsStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  private readonly asking = new Asking(this);

  @property({ attribute: false }) facts: FactRow[] = [];
  @property({ attribute: false }) marriages: Marriage[] = [];

  @state() private editing: Editing = null;
  @state() private menu: FactMenu | null = null;

  private readonly close = () => {
    this.editing = null;
  };

  private readonly closeMenu = () => {
    if (this.asking.busy) return;
    this.asking.forget();
    this.menu = null;
  };

  // The person's sources, as Sources lists them.
  private sources() {
    return this.state.selected.sources.get().flatMap((g) => g.sources);
  }

  private open(supporting: Source[]) {
    const [first] = supporting;
    if (first === undefined) return;
    if (this.state.viewer.openSource(first, { reveal: false })) return;
    this.dispatchEvent(
      new CustomEvent('show-source', {
        detail: first.citation.id,
        bubbles: true,
        composed: true
      })
    );
  }

  private async deleteFact(fact: FactRow) {
    const done = await this.asking.run(async () => {
      await this.state.facts.remove(fact.id);
    });
    if (done) this.menu = null;
  }

  private renderForm(fact: FactRow | null) {
    return html`<sl-fact-form
      .fact=${fact}
      .marriages=${this.marriages}
      .own=${this.facts.filter((f) => f.familyId === null)}
      @closed=${this.close}
    ></sl-fact-form>`;
  }

  // A Fact no source supports is dimmed, so the eye finds those that
  // still need one.
  private renderFact(f: FactRow, sources: Source[]) {
    const supporting = sourcesOf(f, sources);
    const menued = this.menu?.fact.id === f.id;
    return html`<button
        class="fact ${supporting.length === 0 ? 'unsourced' : ''} ${menued ? 'menued' : ''}"
        @click=${() => {
          this.open(supporting);
        }}
        @contextmenu=${(e: MouseEvent) => {
          e.preventDefault();
          if (this.asking.busy) return;
          this.menu = {
            fact: f,
            at: { x: e.clientX, y: e.clientY },
            deleting: false
          };
        }}
      >
        <span class="kind">${factLabel(f)}</span>
        <span class="text">${factText(f)}</span>
      </button>
      ${this.editing === f.id ? this.renderForm(f) : nothing}`;
  }

  private renderMenu() {
    const { menu } = this;
    if (menu === null) return nothing;
    const { fact } = menu;
    if (menu.deleting) {
      const text = factText(fact);
      const ask: Ask = {
        title: `Delete ${factKindLabel(fact.tag).toLowerCase()}?`,
        ...(text === '' ? {} : { text }),
        step: 'Delete',
        tone: 'danger'
      };
      return html`<sl-ask
        .ask=${ask}
        .busy=${this.asking.busy ? 'Deleting…' : null}
        .refused=${this.asking.refused}
        @cancel=${this.closeMenu}
        @confirm=${() => {
          void this.deleteFact(fact);
        }}
      ></sl-ask>`;
    }
    return html`<sl-context-menu
      .items=${[
        {
          label: 'Edit',
          run: () => {
            this.editing = fact.id;
          }
        },
        {
          label: 'Delete',
          run: () => {
            this.menu = { ...menu, deleting: true };
          }
        }
      ]}
      .at=${menu.at}
      @close=${() => {
        // The menu asks to close before its choice runs: Delete asks
        // instead.
        queueMicrotask(() => {
          if (this.menu === menu) this.menu = null;
        });
      }}
    ></sl-context-menu>`;
  }

  override render() {
    const adding = this.editing === 'new';
    const sources = this.sources();
    return html`<div class="facts">
        ${this.facts.map((f) => this.renderFact(f, sources))}
      </div>
      <button
        class="add"
        @click=${() => {
          this.editing = 'new';
        }}
      >
        Add event
      </button>
      ${adding ? this.renderForm(null) : nothing} ${this.renderMenu()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-events': PersonEventsElement;
  }
}
