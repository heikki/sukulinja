import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Point, Transform, Viewport } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Box, PhotoRow } from '@/common/types';

import { boxFromStage } from '../box-stage/geometry';
import { familyChoices, searchable } from '../person-search/choices';
import { photoItems } from './menu';
import { boxedOn, newTagBox } from './photo-boxes';

import '../box-stage/handles';
import '../context-menu';
import '../person-search/pick';

// Where a right-click opened its menu: on the pending Box, on someone's
// Box, or elsewhere, and whether that Box's Photo is their portrait; and
// whether it's the menu or the people to tag.
interface Popup {
  at: Point;
  onPending: boolean;
  onBox: number | null;
  portrait: boolean;
  show: 'menu' | 'pick';
}

// Tagging people over the Photo: the menu a right-click opens
// (`openMenu`), the people a new Tag can be for, the Selected person's
// family or found by search, and the pending Tag's Box with handles to
// move and resize it. Presses on anything of its own stay here, so they
// don't pan the Photo; elsewhere it pans as ever. `size` is null until the
// Photo is shown, whose pixels Boxes are measured in.
@customElement('sl-photo-layer')
class PhotoLayerElement extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    sl-context-menu {
      pointer-events: auto;
    }
  `;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) photo: PhotoRow | null = null;
  @property({ attribute: false }) view: Transform | null = null;
  @property({ attribute: false }) size: Viewport | null = null;

  @state() private popup: Popup | null = null;

  private get viewer() {
    return this.state.photoViewer;
  }

  // The menu at `at` on the stage, on what `on` names: the pending Box, or
  // the key of someone's Box. None when it has nothing to offer.
  openMenu(at: Point, on: { pending: boolean; key: string | null }) {
    const person = on.key === null ? null : Number(on.key);
    const boxed = this.photo?.people.find(
      (p) => p.personId === person && p.box !== null
    );
    const popup: Popup = {
      at,
      onPending: on.pending,
      onBox: boxed?.personId ?? null,
      portrait: boxed !== undefined && this.isPortrait(boxed.personId),
      show: 'menu'
    };
    this.popup = this.items(popup).length === 0 ? null : popup;
  }

  // Whether the Photo is the person's portrait already, as the chart has
  // it.
  private isPortrait(personId: number) {
    const person = this.state.chart.people.get().persons.get(personId);
    return person !== undefined && person.photo_path === this.photo?.path;
  }

  private items(popup: Popup) {
    return photoItems(
      this.viewer,
      {
        onPending: popup.onPending,
        onBox: popup.onBox,
        portrait: popup.portrait,
        canTag: this.size !== null && this.view !== null
      },
      {
        tag: () => {
          this.popup = { ...popup, show: 'pick' };
        }
      }
    );
  }

  private readonly onPopupClose = () => {
    this.popup = null;
  };

  // A pending Tag for the person, its Box at `at` on the stage.
  private tag(at: Point, personId: number) {
    this.popup = null;
    const { view, size, photo } = this;
    if (view === null || size === null || photo === null) return;
    const point = boxFromStage(
      { left: at.x, top: at.y, width: 0, height: 0 },
      view
    );
    const others = photo.people.flatMap((p) => (p.box === null ? [] : [p.box]));
    this.viewer.tagFor(
      personId,
      newTagBox({ x: point.left, y: point.top }, others, size)
    );
  }

  // The Selected person's family and the search, but those marked on the
  // Photo already.
  private renderPick(at: Point) {
    const left = boxedOn(this.photo?.people ?? []);
    const selected = this.state.selected.id.get();
    const people = this.state.chart.people.get();
    return html`<sl-person-pick
      .heading=${'Who is here?'}
      .at=${at}
      .relativesOf=${selected}
      .choices=${selected === null ? [] : familyChoices(selected, people, left)}
      .persons=${searchable(people.persons, left)}
      @pick=${(e: CustomEvent<{ id: number }>) => {
        this.tag(at, e.detail.id);
      }}
      @close=${this.onPopupClose}
    ></sl-person-pick>`;
  }

  private renderPopup() {
    const { popup } = this;
    if (popup === null) return nothing;
    if (popup.show === 'pick') return this.renderPick(popup.at);
    return html`<sl-context-menu
      .items=${this.items(popup)}
      .at=${popup.at}
      @close=${this.onPopupClose}
    ></sl-context-menu>`;
  }

  // The pending Tag's Box, to move and resize.
  private renderBox() {
    const { view, size } = this;
    if (view === null || size === null) return nothing;
    return html`<sl-box-handles
      .box=${this.viewer.pending.get()?.box ?? null}
      .view=${view}
      .size=${size}
      @box-set=${(e: CustomEvent<Box>) => {
        this.viewer.setBox(e.detail);
      }}
    ></sl-box-handles>`;
  }

  override render() {
    return html`${this.renderBox()} ${this.renderPopup()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-photo-layer': PhotoLayerElement;
  }
}
