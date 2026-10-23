import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Point, Transform, Viewport } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { Box } from '@/common/types';

import type { ReminderDialogProps } from '../reminder-dialog';
import { ReminderModal } from '../reminder-dialog/modal';
import { entriesOn, rowName } from './citations';
import { citeChoices, citingImage, searchable } from './cite';
import { scanLayerStyles } from './edit-styles';
import { boxFromStage, boxOnStage, clampBox, newBox, wholeBox } from './frame';
import type { Frame } from './frame';
import { linkItems } from './menu';
import { reminderChoices, remindersHere } from './reminder-choices';
import type { ReminderOpenEvent } from './reminders';

import '../context-menu';
import '../person-search';
import '../reminder-dialog';
import './reminders';
import './volumes';

// The parts of a Box a drag can take: an edge, a corner, or all of it.
type Grip = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

const GRIPS: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function stop(e: Event) {
  e.stopPropagation();
}

// What a right-click opened: the menu, the Volumes chosen from it, or the
// people an entry can be cited for, listed or searched; or the Reminders
// on the Image, opened from the page nav.
type Popup = 'menu' | 'volumes' | 'cite' | 'search' | 'reminders';

// A drag under way: from where, and the Box it started on.
interface BoxDrag {
  grip: Grip;
  from: Point;
  start: Box;
}

// The Box a drag of `grip` by `d` (in pixels of the Image of `size`)
// gives.
function dragged(start: Box, grip: Grip, d: Point, size: Viewport): Box {
  if (grip === 'move') {
    const left = Math.min(
      Math.max(0, start.left + d.x),
      size.width - start.width
    );
    const top = Math.min(
      Math.max(0, start.top + d.y),
      size.height - start.height
    );
    return { ...start, left, top };
  }
  let { left, top } = start;
  let right = left + start.width;
  let bottom = top + start.height;
  if (grip.includes('w')) left = Math.min(left + d.x, right);
  if (grip.includes('e')) right = Math.max(right + d.x, left);
  if (grip.includes('n')) top = Math.min(top + d.y, bottom);
  if (grip.includes('s')) bottom = Math.max(bottom + d.y, top);
  return clampBox(
    { left, top, width: right - left, height: bottom - top },
    size
  );
}

// Editing the current source's Link over the scan: the menu a right-click
// opens (`openMenu`), the Volumes opened from it, a new entry Box put where
// the menu opened, for the source or for a new Citation of someone in the
// Selected person's family or found by search, and the pending
// Box with handles to move and resize it. Presses on
// anything of its own stay here, so they don't pan the scan; elsewhere the
// scan pans as ever. `canEdit` is false until the full Image is shown,
// whose frame Boxes are measured in.
@customElement('sl-scan-layer')
export class ScanLayerElement extends SignalWatcher(LitElement) {
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
  // A Reminder in the list, clicked, shown in the Reminder dialog.
  private readonly reminderModal = new ReminderModal(this, () => this.state);
  @state() private dialog: ReminderDialogProps | null = null;
  @state() private drag: BoxDrag | null = null;
  // The Box as a drag has it, before it's let go.
  @state() private live: Box | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('mousedown', this.onOutside);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
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
    if (show === 'search' || show === 'reminders') this.popup = null;
  };

  // The Reminders on the Image shown, opened from the page nav's marker
  // at `at` on the stage, or closed when they're open.
  toggleReminders(at: Point) {
    this.popup =
      this.popup?.show === 'reminders'
        ? null
        : { at, onBox: false, show: 'reminders' };
  }

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

  private toStage(e: MouseEvent): Point {
    const rect = this.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Esc stops a drag, or closes the Reminders, before the viewer's Esc
  // closes anything; a Reminder dialog open takes it itself.
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const dialog = this.dialog !== null || this.reminderModal.isOpen;
    const listed = this.popup?.show === 'reminders' && !dialog;
    if (this.drag === null && !listed) return;
    e.preventDefault();
    e.stopPropagation();
    if (listed) this.popup = null;
    this.drag = null;
    this.live = null;
  };

  private start(e: MouseEvent, grip: Grip, start: Box) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.drag = { grip, from: this.toStage(e), start };
    this.live = start;
  }

  private readonly onMove = (e: MouseEvent) => {
    const { drag, view, frame } = this;
    if (drag === null || view === null || frame === null) return;
    const at = this.toStage(e);
    const d = boxFromStage(
      {
        left: view.pan.x + at.x - drag.from.x,
        top: view.pan.y + at.y - drag.from.y,
        width: 0,
        height: 0
      },
      view
    );
    this.live = dragged(
      drag.start,
      drag.grip,
      { x: d.left, y: d.top },
      frame.size
    );
  };

  private readonly onUp = () => {
    const { drag, live, frame } = this;
    if (drag === null) return;
    this.drag = null;
    this.live = null;
    if (live !== null && frame !== null) {
      this.viewer.setBox(wholeBox(live, frame.size));
    }
  };

  private readonly onPopupClose = () => {
    this.popup = null;
  };

  // The current source's person, as the people beside the scan name them.
  private sourceName() {
    const id = this.viewer.source.get()?.citation.id;
    const rows = this.viewer.citations.get();
    const row = Array.isArray(rows)
      ? rows.find((r) => r.citation.id === id)
      : undefined;
    const name = row === undefined ? '—' : rowName(this.persons, row);
    return name === '—' ? null : name;
  }

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
    return newBox({ x: point.left, y: point.top }, others, frame.size);
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
      .heading=${'Create entry for'}
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

  // The dialog to write a Reminder on the Image shown, starting on the
  // source's Citation when it's opened from its Box.
  private remind(onBox: boolean) {
    const from = onBox ? (this.viewer.source.get()?.citation.id ?? null) : null;
    const choices = reminderChoices(this.state, from);
    if (choices === null) return;
    this.popup = null;
    this.dialog = {
      heading: 'Add reminder',
      ...choices,
      text: '',
      save: async (text, target) => {
        await this.state.reminders.remind(text, target);
      }
    };
  }

  private here() {
    const volume = this.viewer.volume.get();
    if (volume === null) return undefined;
    return { volumeId: volume.id, image: this.viewer.image.get() };
  }

  private renderReminders(at: Point) {
    return html`<sl-scan-reminders
      style="left: ${at.x}px; top: ${at.y}px"
      .reminders=${remindersHere(this.state)}
      .persons=${this.persons}
      .here=${this.here() ?? null}
      @reminder-open=${(e: ReminderOpenEvent) => {
        this.reminderModal.open(e.detail);
      }}
    ></sl-scan-reminders>`;
  }

  private renderDialog() {
    if (this.dialog === null) return nothing;
    const { heading, choices, chosen, text, save } = this.dialog;
    return html`<sl-reminder-dialog
      .heading=${heading}
      .choices=${choices}
      .chosen=${chosen}
      .text=${text}
      .save=${save}
      @close=${() => {
        this.dialog = null;
      }}
    ></sl-reminder-dialog>`;
  }

  private renderPopup() {
    if (this.popup === null) return nothing;
    const { at, onBox, show } = this.popup;
    if (show === 'reminders') return this.renderReminders(at);
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
      { onBox, canBox: this.editable, name: this.sourceName() },
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
          this.remind(onBox);
        }
      }
    );
    return html`<sl-context-menu
      .items=${items}
      .at=${at}
      @close=${this.onPopupClose}
    ></sl-context-menu>`;
  }

  // The pending Box, or the one being dragged.
  private renderBox() {
    const { view, frame } = this;
    if (view === null || frame === null || !this.editable) return nothing;
    const pending = this.viewer.boxPending.get()
      ? this.viewer.boxHere.get()
      : null;
    const box = this.live ?? pending;
    if (box === null) return nothing;
    const at = boxOnStage(box, view);
    return html`
      <div
        class="box"
        data-own="true"
        style="left: ${at.left}px; top: ${at.top}px; width: ${at.width}px; height: ${at.height}px"
        @mousedown=${(e: MouseEvent) => {
          this.start(e, 'move', box);
        }}
      >
        ${GRIPS.map(
          (g) =>
            html`<span
              class="grip ${g}"
              @mousedown=${(e: MouseEvent) => {
                this.start(e, g, box);
              }}
            ></span>`
        )}
      </div>
    `;
  }

  override render() {
    return html`${this.renderBox()} ${this.renderPopup()} ${this.renderDialog()}
    ${this.reminderModal.render()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-layer': ScanLayerElement;
  }
}
