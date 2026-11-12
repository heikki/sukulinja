import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Point } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PersonRow, Relation } from '@/common/types';

import {
  addableRelations,
  RELATION_LABELS,
  relativeFormProps
} from '../person-form/relations';
import type { PersonChoice } from './choices';

import '../context-menu';
import '../person-form/relative';
import './index';

function stop(e: Event) {
  e.stopPropagation();
}

// Picking someone where a viewer's menu opened, for what it makes there: a
// menu of `choices` under `heading`; then "New father…" and the rest, of
// `relativesOf`, which open the new-relative form in its place and pick
// the person it puts in the tree; then "Someone else…", which opens the
// search of `persons` in its place. Names the person picked with `pick`,
// and asks to `close` on Esc or a press elsewhere. Presses on it stay on
// it, so they don't pan the picture under it.
@customElement('sl-person-pick')
class PersonPickElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      display: contents;
    }

    sl-context-menu,
    sl-relative-form,
    .search {
      pointer-events: auto;
    }

    .search {
      position: absolute;
      z-index: 2;
      width: 16rem;
    }
  `;

  @property({ attribute: false }) heading = '';
  @property({ attribute: false }) at: Point = { x: 0, y: 0 };
  @property({ attribute: false }) choices: PersonChoice[] = [];
  @property({ attribute: false }) persons = new Map<number, PersonRow>();
  // Whose new relative can be made and picked: the Selected person.
  @property({ attribute: false }) relativesOf: number | null = null;

  @consume({ context: appState }) private readonly state!: AppState;

  @state() private searching = false;
  // The relation a new person is being made as, once picked.
  @state() private adding: Relation | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousedown', this.onOutside);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousedown', this.onOutside);
  }

  // The search takes the typing as it opens, once it has drawn its input.
  override updated(changed: Map<string, unknown>) {
    if (!changed.has('searching') || !this.searching) return;
    const search = this.renderRoot.querySelector('sl-person-search');
    void search?.updateComplete.then(() => {
      search.focusInput();
    });
  }

  private close() {
    this.dispatchEvent(new CustomEvent('close'));
  }

  private picked(id: number) {
    this.dispatchEvent(new CustomEvent('pick', { detail: { id } }));
  }

  // A press outside the search closes it, as one outside a menu does;
  // presses on it stop there.
  private readonly onOutside = () => {
    if (this.searching) this.close();
  };

  // Esc clears what's typed, as the search does, then closes it; the
  // viewer's Esc never sees it.
  private renderSearch() {
    return html`<div
      class="search"
      style="left: ${this.at.x}px; top: ${this.at.y}px"
      @mousedown=${stop}
      @wheel=${stop}
      @dblclick=${stop}
      @contextmenu=${stop}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (!e.defaultPrevented) this.close();
        e.preventDefault();
      }}
    >
      <sl-person-search
        .persons=${this.persons}
        @pick=${(e: CustomEvent<{ id: number }>) => {
          this.picked(e.detail.id);
        }}
      ></sl-person-search>
    </div>`;
  }

  // The new relative's form, of `relativesOf` as `relation`.
  private renderNew(personId: number, relation: Relation) {
    const people = this.state.chart.people.get();
    const form = relativeFormProps(personId, relation, people);
    return html`<sl-relative-form
      .personId=${personId}
      .relation=${relation}
      .heading=${form.heading}
      .at=${this.at}
      .sex=${form.sex}
      .families=${form.families}
      .persons=${people.persons}
      @added=${(e: CustomEvent<{ id: number }>) => {
        this.picked(e.detail.id);
      }}
      @closed=${() => {
        this.close();
      }}
    ></sl-relative-form>`;
  }

  // "New father…" and the rest, of `relativesOf`.
  private newItems() {
    const of = this.relativesOf;
    if (of === null) return [];
    const people = this.state.chart.people.get();
    return addableRelations(of, people).map((relation) => ({
      label: `New ${RELATION_LABELS[relation].toLowerCase()}…`,
      run: () => {
        this.adding = relation;
      }
    }));
  }

  override render() {
    if (this.searching) return this.renderSearch();
    if (this.adding !== null && this.relativesOf !== null) {
      return this.renderNew(this.relativesOf, this.adding);
    }
    const items = [
      ...this.choices.map((c) => ({
        label: c.label,
        muted: c.muted,
        run: () => {
          this.picked(c.personId);
        }
      })),
      ...this.newItems(),
      {
        label: 'Someone else…',
        run: () => {
          this.searching = true;
        }
      }
    ];
    return html`<sl-context-menu
      .items=${items}
      .heading=${this.heading}
      .at=${this.at}
      @close=${() => {
        // The menu asks to close before it runs the item chosen, which may
        // open the search instead.
        queueMicrotask(() => {
          if (!this.searching && this.adding === null) this.close();
        });
      }}
    ></sl-context-menu>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-person-pick': PersonPickElement;
  }
}
