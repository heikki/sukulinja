import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { InEntry } from '@/client/dataset-api';
import type { Point, Transform } from '@/client/pan-zoom';
import { appState, citingImage } from '@/client/state';
import type { AppState } from '@/client/state';
import { bookKind } from '@/common/books';
import type { Box } from '@/common/types';

import { boxFromStage, boxOnStage } from '../box-stage/geometry';
import { searchable } from '../person-search/choices';
import { placesHere } from '../reminders-list/places';
import { entriesOn } from './citations';
import {
  parentRows,
  pickFor,
  roleLabel,
  startingPeople,
  withChild
} from './cite';
import { scanLayerStyles } from './edit-styles';
import type { ChooseDetail } from './entry-form';
import { newEntryBox } from './frame';
import type { Frame } from './frame';
import { linkItems } from './menu';

import '../box-stage/handles';
import '../context-menu';
import '../person-search/pick';
import './entry-form';
import './volumes';

// What a right-click opened: the menu, or the Volumes chosen from it; or
// the people to name in a new entry's Role (or with none), listed or
// searched.
type Popup =
  | { at: Point; onBox: boolean; show: 'menu' | 'volumes' }
  | { at: Point; show: 'pick'; role: string | null };

// Editing the current source's Link over the scan: the menu a right-click
// opens (`openMenu`), the Volumes opened from it, a new entry Box put where
// the menu opened, for the source or for a new Citation of someone in the
// Selected person's family or found by search, and the pending
// Box with handles to move and resize it. Presses on
// anything of its own stay here, so they don't pan the scan; elsewhere the
// scan pans as ever. `canEdit` is false until the full Image is shown,
// whose frame Boxes are measured in.
@customElement('sl-scan-layer')
class ScanLayerElement extends SignalWatcher(LitElement) {
  static override styles = scanLayerStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) view: Transform | null = null;
  @property({ attribute: false }) frame: Frame | null = null;
  @property({ type: Boolean }) canEdit = false;
  // The dataset's people, who name the citations.
  private get persons() {
    return this.state.chart.people.get().persons;
  }

  @state() private popup: Popup | null = null;

  // The menu at `at` on the stage; `onBox` when it's on the source's own
  // entry Box, which then has a menu of its own.
  // None over a Volume on a filming Astia replaced: it's read-only.
  openMenu(at: Point, onBox: boolean) {
    if (this.viewer.oldFilming.get()) return;
    this.popup = { at, onBox, show: 'menu' };
  }

  // A Volume on a filming Astia replaced is read-only until switched.
  private get editable() {
    return this.canEdit && !this.viewer.oldFilming.get();
  }

  private get viewer() {
    return this.state.viewer;
  }

  private readonly onPopupClose = () => {
    this.popup = null;
  };

  // A new entry Box at `at` on the stage, sized as the Image's other
  // entries; null until the full Image is shown.
  private newBoxAt(at: Point) {
    const { view, frame } = this;
    if (view === null || frame === null) return null;
    const point = boxFromStage(
      { left: at.x, top: at.y, width: 0, height: 0 },
      view
    );
    const rows = this.viewer.citations.get();
    const others = Array.isArray(rows)
      ? entriesOn(rows, this.viewer.image.get()).map((e) => e.box)
      : [];
    return newEntryBox({ x: point.left, y: point.top }, others, frame.size);
  }

  // A new pending Box at `at` for the source's entry, to move and resize
  // from there.
  private placeBox(at: Point) {
    const box = this.newBoxAt(at);
    if (box !== null) this.viewer.setBox(box);
  }

  // A pending Box at `at` for a new Entry, naming to start with whom the
  // Volume's Book and the Selected person suggest.
  private newEntry(at: Point) {
    this.popup = null;
    const box = this.newBoxAt(at);
    const shown = this.viewer.volume.get();
    if (box === null || shown === null) return;
    const people = startingPeople(
      shown.label,
      this.state.selected.id.get(),
      this.state.chart.people.get(),
      this.citingHere()
    );
    this.viewer.newEntry(box, people);
  }

  // Whose Citations already link the Image shown: not cited for again.
  private citingHere() {
    const rows = this.viewer.citations.get();
    return citingImage(
      Array.isArray(rows) ? rows : [],
      this.viewer.image.get()
    );
  }

  // Whom to name in the Role (`label`): in a baptism, once its child or a
  // parent is named, whom the tree says; else the Selected person's family
  // and the search. Never those `notNamable`.
  private renderPick(at: Point, role: string | null) {
    const selected = this.state.selected.id.get();
    const named = this.viewer.pending.get()?.cite?.people ?? [];
    const left = this.viewer.entryForm.notNamable.get();
    const volume = this.viewer.volume.get()?.label ?? '';
    const ix = this.state.chart.people.get();
    const pick = pickFor({ volume, role, named }, ix, selected, left);
    return html`<sl-person-pick
      .heading=${roleLabel(volume, role)}
      .at=${at}
      .relativesOf=${pick.relativesOf}
      .newAs=${pick.newAs}
      .search=${pick.search}
      .choices=${pick.choices}
      .persons=${searchable(this.persons, left)}
      @pick=${(e: CustomEvent<{ id: number }>) => {
        this.popup = null;
        this.named(e.detail.id, role);
      }}
      @close=${this.onPopupClose}
    ></sl-person-pick>`;
  }

  // Someone picked for the Role. A baptism's child brings their parents
  // in the tree, in place of those named before.
  private named(personId: number, role: string | null) {
    const people = this.viewer.pending.get()?.cite?.people ?? [];
    const volume = this.viewer.volume.get()?.label ?? '';
    if (role === 'CHIL' && bookKind(volume) === 'kastetut') {
      const ix = this.state.chart.people.get();
      this.viewer.entryForm.setPeople(withChild(people, personId, ix));
    } else this.viewer.entryForm.setInEntry({ personId, role });
  }

  // The pending Entry's people and words, beside its Box.
  private renderEntry() {
    const { view } = this;
    const pending = this.viewer.pending.get();
    if (view === null || pending?.cite === undefined) return nothing;
    const ix = this.state.chart.people.get();
    return html`<sl-scan-entry
      .anchor=${boxOnStage(pending.box, view)}
      .cite=${pending.cite}
      .volume=${pending.volume}
      .persons=${this.persons}
      .parents=${parentRows(pending.cite.people, ix)}
      @name=${(e: CustomEvent<InEntry>) => {
        this.viewer.entryForm.setInEntry(e.detail);
      }}
      @choose=${(e: CustomEvent<ChooseDetail>) => {
        this.popup = { at: e.detail.at, show: 'pick', role: e.detail.role };
      }}
      @drop=${(e: CustomEvent<{ personId: number }>) => {
        this.viewer.entryForm.drop(e.detail.personId);
      }}
    ></sl-scan-entry>`;
  }

  // A Reminder on the Image shown and the Selected person, written in the
  // Reminders list.
  private remind() {
    const places = placesHere(this.state);
    if (places === null) return;
    this.popup = null;
    this.state.reminders.draft(places);
  }

  private renderPopup() {
    const { popup } = this;
    if (popup === null) return nothing;
    if (popup.show === 'pick') return this.renderPick(popup.at, popup.role);
    const { at, onBox, show } = popup;
    if (show === 'volumes') {
      return html`<sl-scan-volumes
        .at=${at}
        @close=${this.onPopupClose}
      ></sl-scan-volumes>`;
    }
    const items = linkItems(
      this.viewer,
      { onBox, canBox: this.editable },
      {
        chooseVolume: () => {
          this.popup = { at, onBox, show: 'volumes' };
        },
        placeBox: () => {
          this.placeBox(at);
        },
        cite: () => {
          this.newEntry(at);
        },
        remind: () => {
          this.remind();
        }
      }
    );
    return html`<sl-context-menu
      .items=${items}
      .at=${at}
      @close=${this.onPopupClose}
    ></sl-context-menu>`;
  }

  // The pending Box, to move and resize.
  private renderBox() {
    const { view, frame } = this;
    if (frame === null || !this.editable) return nothing;
    const pending = this.viewer.boxPending.get()
      ? this.viewer.boxHere.get()
      : null;
    return html`<sl-box-handles
      .box=${pending}
      .view=${view}
      .size=${frame.size}
      @box-set=${(e: CustomEvent<Box>) => {
        this.viewer.setBox(e.detail);
      }}
    ></sl-box-handles>`;
  }

  override render() {
    return html`${this.renderBox()} ${this.renderEntry()} ${this.renderPopup()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-layer': ScanLayerElement;
  }
}
