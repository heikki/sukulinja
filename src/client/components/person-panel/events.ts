import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { focusRingStyles } from '@/client/focus-ring';
import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState, Source } from '@/client/state';
import type { FactRow, Marriage } from '@/common/types';

import '../context-menu';
import './fact-form';

import type { MenuItem } from '../context-menu';
import { personEventsStyles } from './events-styles';
import {
  factBrief,
  factLabel,
  factText,
  sourcesOf,
  titleText,
  viewerOpening
} from './helpers';

// A Fact's form open in its place: a new one's, or a Fact's, asking first
// to delete it when that's what was chosen.
type Editing = { fact: number; deleting: boolean } | 'new' | null;

// The Fact a right-click opened the menu for, and where in Events.
interface FactMenu {
  fact: FactRow;
  at: Point;
}

// A source in the menu: by the name Sources gives it, and below it where
// in its Volume it is, unless its name says (a reference to a page).
function sourceItem(source: Source, run: () => void): MenuItem {
  const { citation: c, status } = source;
  const entry = c.entry === null || c.citedPage !== null ? null : c.entry;
  return {
    label: titleText(c, status),
    muted: { before: '↳' },
    ...(entry === null ? {} : { detail: entry }),
    run
  };
}

// The person's Facts, and their marriages', from birth to death: each
// kind, then its date, place and what else it says, dimmed while no source
// supports it. Clicking one picks it, showing under it its sources and
// what can be done of it; editing opens it in its place, and _Add event_
// opens a new one below; one at a time. A right-click opens its menu: editing, deleting, and the sources
// supporting it (ADR-0022), each opened in the Scan viewer; one with
// nothing to open there is asked for in Sources, as `show-source` with its
// Citation's id.
@customElement('sl-person-events')
class PersonEventsElement extends SignalWatcher(LitElement) {
  static override styles = [focusRingStyles, personEventsStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) facts: FactRow[] = [];
  @property({ attribute: false }) marriages: Marriage[] = [];

  @state() private editing: Editing = null;
  @state() private menu: FactMenu | null = null;
  // The Fact picked, by id: its sources and what can be done of it show
  // under it.
  @state() private picked: number | null = null;

  private readonly close = () => {
    this.editing = null;
  };

  private edit(fact: FactRow, deleting = false) {
    this.picked = null;
    this.editing = { fact: fact.id, deleting };
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

  private menuItems(fact: FactRow): MenuItem[] {
    const sources = sourcesOf(fact, this.sources());
    return [
      {
        label: 'Edit',
        run: () => {
          this.edit(fact);
        }
      },
      {
        label: 'Delete event…',
        run: () => {
          this.edit(fact, true);
        }
      },
      ...sources.map((source) =>
        sourceItem(source, () => {
          this.openSource(source);
        })
      )
    ];
  }

  private openMenu(fact: FactRow, e: MouseEvent) {
    e.preventDefault();
    const box = this.getBoundingClientRect();
    this.menu = {
      fact,
      at: { x: e.clientX - box.left, y: e.clientY - box.top }
    };
  }

  private renderMenu() {
    const { menu } = this;
    if (menu === null) return nothing;
    return html`<sl-context-menu
      .heading=${factBrief(menu.fact)}
      .items=${this.menuItems(menu.fact)}
      .at=${menu.at}
      @close=${() => {
        this.menu = null;
      }}
    ></sl-context-menu>`;
  }

  private renderForm(fact: FactRow | null, deleting = false) {
    return html`<sl-fact-form
      .fact=${fact}
      .marriages=${this.marriages}
      .deleting=${deleting}
      @closed=${this.close}
    ></sl-fact-form>`;
  }

  // Under the picked Fact: the sources supporting it, each opened as from
  // the menu, then editing and deleting it.
  private renderPicked(f: FactRow, sources: Source[]) {
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
      <div class="actions">
        <button
          @click=${() => {
            this.edit(f);
          }}
        >
          Edit
        </button>
        <button
          class="danger"
          @click=${() => {
            this.edit(f, true);
          }}
        >
          Delete
        </button>
      </div>
    </div>`;
  }

  // A Fact no source supports is dimmed, so the eye finds those that
  // still need one. Clicking picks it, or lets it go; a double-click or
  // Enter on the picked one edits it, and Esc lets it go.
  private renderFact(f: FactRow, sources: Source[]) {
    const { editing } = this;
    if (editing !== null && editing !== 'new' && editing.fact === f.id) {
      return this.renderForm(f, editing.deleting);
    }
    const supporting = sourcesOf(f, sources);
    const picked = this.picked === f.id;
    return html`<button
        class="fact ${supporting.length === 0 ? 'unsourced' : ''}"
        aria-expanded=${picked ? 'true' : 'false'}
        aria-haspopup="menu"
        @click=${() => {
          this.picked = picked ? null : f.id;
        }}
        @dblclick=${() => {
          this.edit(f);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape' && picked) {
            e.preventDefault();
            e.stopPropagation();
            this.picked = null;
          }
        }}
        @contextmenu=${(e: MouseEvent) => {
          this.openMenu(f, e);
        }}
      >
        <span class="kind">${factLabel(f)}</span>
        <span class="text">${factText(f)}</span>
      </button>
      ${picked ? this.renderPicked(f, supporting) : nothing}`;
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
      }
      ${this.renderMenu()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-events': PersonEventsElement;
  }
}
