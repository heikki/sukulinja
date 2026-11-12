import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { ApiError } from '@/client/dataset-api';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import { deleteCuts } from '@/common/tree-cut';
import type { FamilyRow, Relation } from '@/common/types';

import type { MenuItem } from '../context-menu';
import { movings } from '../person-form/moves';
import type { Moving } from '../person-form/moves';
import {
  addableRelations,
  RELATION_LABELS,
  relativeFormProps
} from '../person-form/relations';
import { unlinkings } from '../person-form/unlinkings';

import '../context-menu';
import '../person-form/delete';
import '../person-form/move';
import '../person-form/relative';

import type { Point } from './emit';
import { formatName } from './renderer';

// Whether the person can be deleted: not the last one, and not cutting
// the tree in two (tree-cut.ts), which isn't offered at all.
function deletable(
  personId: number,
  people: { persons: Map<number, unknown>; families: readonly FamilyRow[] }
) {
  return people.persons.size > 1 && !deleteCuts(people.families, personId);
}

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
// Reminder about them; adding a relative of theirs, as `addableRelations`
// allows, whose form opens in the menu's place; and taking them out of a
// family, as `unlinkings` allows; moving them to another, as `movings`
// offers; and deleting them, asked first. Asks to
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
  // Moving them out of a family, once picked: the form for where to.
  @state() private moving: Moving | null = null;
  // Deleting them, once picked: the dialog asking first.
  @state() private deleting = false;
  // Taking them out of a family, once picked; why it was refused, if it
  // was, shown in the menu's place.
  @state() private unlinking: { refused: string | null } | null = null;

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('menu')) {
      this.adding = null;
      this.deleting = false;
      this.moving = null;
      this.unlinking = null;
    }
  }

  private async unlink(personId: number, familyId: number) {
    this.unlinking = { refused: null };
    try {
      await this.state.personEdits.unlink(personId, familyId);
      this.close();
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      this.unlinking = { refused: err.message };
    }
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
      })),
      ...unlinkings(menu.personId, people).map(({ familyId, label }) => ({
        label,
        run: () => {
          void this.unlink(menu.personId, familyId);
        }
      })),
      ...movings(menu.personId, people).map((moving) => ({
        label: moving.label,
        run: () => {
          this.moving = moving;
        }
      })),
      ...(deletable(menu.personId, people)
        ? [
            {
              label: 'Delete person…',
              run: () => {
                this.deleting = true;
              }
            }
          ]
        : [])
    ];
  }

  override render() {
    const { menu, adding } = this;
    const people = this.state.chart.people.get();
    const person =
      menu === null ? undefined : people.persons.get(menu.personId);
    if (menu === null || person === undefined) return nothing;
    const name = formatName(person);
    if (this.moving !== null) {
      return html`<sl-move-form
        .personId=${menu.personId}
        .moving=${this.moving}
        .heading=${`${this.moving.label.replace('…', '')}: ${name}`}
        .at=${menu.at}
        @closed=${() => {
          this.close();
        }}
      ></sl-move-form>`;
    }
    if (this.deleting) {
      return html`<sl-delete-person
        .person=${person}
        @closed=${() => {
          this.close();
        }}
      ></sl-delete-person>`;
    }
    if (this.unlinking !== null) {
      const { refused } = this.unlinking;
      if (refused === null) return nothing;
      return html`<sl-context-menu
        .items=${[{ label: 'OK', run: () => undefined }]}
        .heading=${refused}
        .at=${menu.at}
        @close=${() => {
          this.close();
        }}
      ></sl-context-menu>`;
    }
    if (adding === null) {
      return html`<sl-context-menu
        .items=${this.items(menu, name)}
        .heading=${name}
        .at=${menu.at}
        @close=${() => {
          // The menu closes before its choice runs: a relation picked
          // opens its form instead.
          queueMicrotask(() => {
            if (
              this.adding === null &&
              this.unlinking === null &&
              this.moving === null &&
              !this.deleting
            ) {
              this.close();
            }
          });
        }}
      ></sl-context-menu>`;
    }
    const form = relativeFormProps(menu.personId, adding, people);
    return html`<sl-relative-form
      .personId=${menu.personId}
      .relation=${adding}
      .heading=${form.heading}
      .at=${menu.at}
      .sex=${form.sex}
      .families=${form.families}
      .persons=${people.persons}
      @added=${(e: CustomEvent<{ id: number }>) => {
        void this.state.chart.added(e.detail.id);
      }}
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
