import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Point, Transform } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Box } from '@/common/types';

import { boxFromStage } from '../box-stage/geometry';
import { placesHere } from '../reminders-list/places';
import { entriesOn } from './citations';
import { citeChoices, citingImage, searchable } from './cite';
import { scanLayerStyles } from './edit-styles';
import { newEntryBox } from './frame';
import type { Frame } from './frame';
import { linkItems } from './menu';

import '../box-stage/handles';
import '../context-menu';
import '../person-search';
import './volumes';

function stop(e: Event) {
  e.stopPropagation();
}

// What a right-click opened: the menu, the Volumes chosen from it, or the
// people an entry can be cited for, listed or searched; or the Reminders
// on the Image, opened from the page nav.
type Popup = 'menu' | 'volumes' | 'cite' | 'search';

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

  @state() private popup: { at: Point; onBox: boolean; show: Popup } | null =
    null;
  private searchOpened = false;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousedown', this.onOutside);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousedown', this.onOutside);
  }

  // The search takes the typing as it opens, once it has drawn its input.
  override updated() {
    if (!this.searchOpened) return;
    this.searchOpened = false;
    const search = this.renderRoot.querySelector('sl-person-search');
    void search?.updateComplete.then(() => {
      search.focusInput();
    });
  }

  // A press outside the search closes it, as one outside a menu does;
  // presses on it stop there.
  private readonly onOutside = () => {
    const show = this.popup?.show;
    if (show === 'search') this.popup = null;
  };

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

  // A pending Box at `at` for a new Citation of the entry for the person.
  private cite(at: Point, personId: number) {
    this.popup = null;
    const box = this.newBoxAt(at);
    if (box !== null) this.viewer.citeFor(personId, box);
  }

  // Whose Citations already link the Image shown: not cited for again.
  private citingHere() {
    const rows = this.viewer.citations.get();
    return citingImage(
      Array.isArray(rows) ? rows : [],
      this.viewer.image.get()
    );
  }

  private renderCite(at: Point) {
    const selected = this.state.selected.id.get();
    const left = this.citingHere();
    const family =
      selected === null
        ? []
        : citeChoices(selected, this.state.chart.people.get(), left);
    const items = [
      ...family.map((c) => ({
        label: c.label,
        muted: c.muted,
        run: () => {
          this.cite(at, c.personId);
        }
      })),
      {
        label: 'Someone else…',
        run: () => {
          this.popup = { at, onBox: false, show: 'search' };
          this.searchOpened = true;
        }
      }
    ];
    return html`<sl-context-menu
      .items=${items}
      .heading=${'New citation for'}
      .at=${at}
      @close=${this.onPopupClose}
    ></sl-context-menu>`;
  }

  // Esc clears what's typed, as the search does, then closes it; the
  // viewer's Esc never sees it. Presses on it stay on it, so they don't
  // pan the scan.
  private renderSearch(at: Point) {
    return html`<div
      class="search"
      style="left: ${at.x}px; top: ${at.y}px"
      @mousedown=${stop}
      @wheel=${stop}
      @dblclick=${stop}
      @contextmenu=${stop}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (!e.defaultPrevented) this.popup = null;
        e.preventDefault();
      }}
    >
      <sl-person-search
        .persons=${searchable(this.persons, this.citingHere())}
        @pick=${(e: CustomEvent<{ id: number }>) => {
          this.cite(at, e.detail.id);
        }}
      ></sl-person-search>
    </div>`;
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
    if (this.popup === null) return nothing;
    const { at, onBox, show } = this.popup;
    if (show === 'volumes') {
      return html`<sl-scan-volumes
        .at=${at}
        @close=${this.onPopupClose}
      ></sl-scan-volumes>`;
    }
    if (show === 'cite') return this.renderCite(at);
    if (show === 'search') return this.renderSearch(at);
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
          this.popup = { at, onBox, show: 'cite' };
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
    return html`${this.renderBox()} ${this.renderPopup()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-layer': ScanLayerElement;
  }
}
