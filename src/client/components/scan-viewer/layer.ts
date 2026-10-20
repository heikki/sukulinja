import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { Point, Transform } from '@client/pan-zoom';
import { appState } from '@client/state';
import type { AppState } from '@client/state';
import type { Box, PersonRow } from '@common/types';

import { entriesOn, rowName } from './citations';
import { scanLayerStyles } from './edit-styles';
import { boxFromStage, boxOnStage, clampBox, newBox } from './frame';
import type { Frame } from './frame';
import { linkItems } from './menu';

import '../context-menu';
import './volumes';

// The parts of a Box a drag can take: an edge, a corner, or all of it.
type Grip = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

const GRIPS: Grip[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

// A drag under way: from where, and the Box it started on.
interface BoxDrag {
  grip: Grip;
  from: Point;
  start: Box;
}

// The Box a drag of `grip` by `d` (in fractions of the Image) gives.
function dragged(start: Box, grip: Grip, d: Point): Box {
  if (grip === 'move') {
    const left = Math.min(Math.max(0, start.left + d.x), 1 - start.width);
    const top = Math.min(Math.max(0, start.top + d.y), 1 - start.height);
    return { ...start, left, top };
  }
  let { left, top } = start;
  let right = left + start.width;
  let bottom = top + start.height;
  if (grip.includes('w')) left = Math.min(left + d.x, right);
  if (grip.includes('e')) right = Math.max(right + d.x, left);
  if (grip.includes('n')) top = Math.min(top + d.y, bottom);
  if (grip.includes('s')) bottom = Math.max(bottom + d.y, top);
  return clampBox({ left, top, width: right - left, height: bottom - top });
}

// Editing the current source's Link over the scan: the menu a right-click
// opens (`openMenu`), the Volumes opened from it, a new entry Box put where
// the menu opened, and the pending Box with handles to move and resize it. Presses on
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
  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  @state() private popup: {
    at: Point;
    onBox: boolean;
    volumes: boolean;
  } | null = null;
  @state() private drag: BoxDrag | null = null;
  // The Box as a drag has it, before it's let go.
  @state() private live: Box | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
  }

  // The menu at `at` on the stage; `onBox` when it's on the source's own
  // entry Box, which then has a menu of its own.
  openMenu(at: Point, onBox: boolean) {
    this.popup = { at, onBox, volumes: false };
  }

  private get viewer() {
    return this.state.viewer;
  }

  private toStage(e: MouseEvent): Point {
    const rect = this.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Esc stops a drag before the viewer's Esc closes anything.
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || this.drag === null) return;
    e.preventDefault();
    e.stopPropagation();
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
      view,
      frame
    );
    this.live = dragged(drag.start, drag.grip, { x: d.left, y: d.top });
  };

  private readonly onUp = () => {
    const { drag, live } = this;
    if (drag === null) return;
    this.drag = null;
    this.live = null;
    if (live !== null) this.viewer.setBox(live);
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

  // A pending Box for the source's entry, to move and resize from there:
  // its Link's own Box when it has one on the Image shown, as a Vision match
  // does, else one at `at` on the stage, sized as the Image's other entries.
  private placeBox(at: Point) {
    const { view, frame } = this;
    if (view === null || frame === null) return;
    if (!this.viewer.boxPending.get() && this.viewer.boxHere.get() !== null) {
      this.viewer.editBox();
      return;
    }
    const point = boxFromStage(
      { left: at.x, top: at.y, width: 0, height: 0 },
      view,
      frame
    );
    const rows = this.viewer.citations.get();
    const others = Array.isArray(rows)
      ? entriesOn(rows, this.viewer.image.get()).map((e) => e.box)
      : [];
    this.viewer.setBox(newBox({ x: point.left, y: point.top }, others));
  }

  private renderPopup() {
    if (this.popup === null) return nothing;
    const { at, onBox, volumes } = this.popup;
    if (volumes) {
      return html`<sl-scan-volumes
        .at=${at}
        @close=${this.onPopupClose}
      ></sl-scan-volumes>`;
    }
    const items = linkItems(
      this.viewer,
      { onBox, canBox: this.canEdit },
      {
        chooseVolume: () => {
          this.popup = { at, onBox, volumes: true };
        },
        placeBox: () => {
          this.placeBox(at);
        }
      }
    );
    return html`<sl-context-menu
      .items=${items}
      .heading=${this.sourceName()}
      .at=${at}
      @close=${this.onPopupClose}
    ></sl-context-menu>`;
  }

  // The pending Box, or the one being dragged.
  private renderBox() {
    const { view, frame } = this;
    if (view === null || frame === null || !this.canEdit) return nothing;
    const pending = this.viewer.boxPending.get()
      ? this.viewer.boxHere.get()
      : null;
    const box = this.live ?? pending;
    if (box === null) return nothing;
    const at = boxOnStage(box, view, frame);
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
    return html`${this.renderBox()} ${this.renderPopup()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-layer': ScanLayerElement;
  }
}
