import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Relation } from '@/common/types';

import type { MenuItem } from '../context-menu';
import {
  addableRelations,
  childFamilies,
  RELATION_LABELS,
  startingSex
} from '../relative-form/relations';

import '../context-menu';
import '../relative-form';

import type { Point } from './emit';
import { formatName } from './renderer';

// A card's menu, opened by a right-click: where in the canvas, and for
// whom, drawn at `pos` in the chart.
export interface CardMenu {
  at: Point;
  personId: number;
  pos: Point;
}

// The menu a right-click on `box`'s card opens, in the canvas it's in, in
// place of WebKit's own.
export function cardMenuAt(
  e: MouseEvent,
  box: { personId: number; pos: Point }
) {
  e.preventDefault();
  const canvas = (e.currentTarget as Element).closest('.canvas');
  if (canvas === null) return null;
  const rect = canvas.getBoundingClientRect();
  const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  return { at, personId: box.personId, pos: box.pos };
}

// What a card's menu offers, under its person's name: making them Root,
// unless they are, which it asks the chart for with `make-root`; writing a
// Reminder about them; and adding a relative of theirs, as
// `addableRelations` allows, whose form opens in the menu's place. Asks to
// `close` once done with.
@customElement('sl-card-menu')
class CardMenuElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      display: contents;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) menu: CardMenu | null = null;
  @property({ attribute: false }) rootId: number | null = null;

  // The relation a new person is being added as, once picked.
  @state() private adding: Relation | null = null;

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('menu')) this.adding = null;
  }

  private close() {
    this.dispatchEvent(new Event('close'));
  }

  private items(menu: CardMenu, name: string): MenuItem[] {
    const people = this.state.chart.people.get();
    const root: MenuItem[] =
      menu.personId === this.rootId
        ? []
        : [
            {
              label: 'Build tree from here',
              run: () => {
                this.dispatchEvent(
                  new CustomEvent<CardMenu>('make-root', { detail: menu })
                );
              }
            }
          ];
    return [
      ...root,
      {
        label: 'Add reminder…',
        run: () => {
          // On the person alone, written in the Reminders list.
          this.state.reminders.draft({
            person: { personId: menu.personId, header: name },
            image: null
          });
        }
      },
      ...addableRelations(menu.personId, people).map((relation) => ({
        label: `Add ${RELATION_LABELS[relation].toLowerCase()}…`,
        run: () => {
          this.adding = relation;
        }
      }))
    ];
  }

  override render() {
    const { menu, adding } = this;
    const people = this.state.chart.people.get();
    const person =
      menu === null ? undefined : people.persons.get(menu.personId);
    if (menu === null || person === undefined) return nothing;
    const name = formatName(person);
    if (adding === null) {
      return html`<sl-context-menu
        .items=${this.items(menu, name)}
        .heading=${name}
        .at=${menu.at}
        @close=${() => {
          // The menu closes before its choice runs: a relation picked
          // opens its form instead.
          queueMicrotask(() => {
            if (this.adding === null) this.close();
          });
        }}
      ></sl-context-menu>`;
    }
    return html`<sl-relative-form
      .personId=${menu.personId}
      .relation=${adding}
      .heading=${`${RELATION_LABELS[adding]} of ${name}`}
      .at=${menu.at}
      .sex=${startingSex(adding, person.sex)}
      .families=${adding === 'child' ? childFamilies(menu.personId, people) : []}
      .persons=${people.persons}
      @closed=${() => {
        this.close();
      }}
    ></sl-relative-form>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-card-menu': CardMenuElement;
  }
}
