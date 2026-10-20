import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Point, Transform } from '@client/pan-zoom';
import { appState } from '@client/state';
import type { AppState } from '@client/state';
import type { VolumeCitation } from '@common/types';

import { entriesOn, pickRow } from './citations';
import type { Entry } from './citations';
import { boxOnStage } from './frame';
import type { Frame } from './frame';
import { scanEntriesStyles } from './styles';

// The viewer's: a press moving further than this is a pan, not a click.
const CLICK_SLOP_PX = 4;

// Over the scan: a box around each entry of the Image shown whose place on
// it is known, moved with the scan. Only the current citation's shows and
// takes the pointer; the others show while their row is hovered. Hovering
// the current one names its key with `scan-hover` (null on leaving), and
// clicking it picks its first person, as their row does. It's marked
// `data-own`, for the menu a right-click opens on it. Presses, wheels and
// pinches carry on to the stage, so a drag starting on a box still pans.
@customElement('sl-scan-entries')
export class ScanEntriesElement extends LitElement {
  static override styles = scanEntriesStyles;

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) rows: VolumeCitation[] = [];
  @property({ type: Number }) image = 1;
  @property({ attribute: false }) view: Transform | null = null;
  @property({ attribute: false }) frame: Frame | null = null;
  // The key of the entry picked out, and the citation the viewer is on.
  @property({ attribute: false }) hovered: string | null = null;
  @property({ attribute: false }) current: number | null = null;

  private pressedAt: Point | null = null;

  private ask(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private onClick(e: MouseEvent, entry: Entry) {
    const from = this.pressedAt;
    this.pressedAt = null;
    if (from === null) return;
    const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
    const [first] = entry.rows;
    if (moved < CLICK_SLOP_PX && first !== undefined) {
      pickRow(this, this.state.viewer, first);
    }
  }

  private renderEntry(entry: Entry, view: Transform, frame: Frame) {
    const at = boxOnStage(entry.box, view, frame);
    const current = entry.rows.some((r) => r.citation.id === this.current);
    const classes = [
      'entry',
      current ? 'current' : '',
      entry.key === this.hovered ? 'hovered' : ''
    ].join(' ');
    return html`
      <div
        class=${classes}
        data-own=${current ? 'true' : nothing}
        style="left: ${at.left}px; top: ${at.top}px; width: ${
          at.width
        }px; height: ${at.height}px"
        @mousedown=${(e: MouseEvent) => {
          this.pressedAt = { x: e.clientX, y: e.clientY };
        }}
        @click=${(e: MouseEvent) => {
          this.onClick(e, entry);
        }}
        @mouseenter=${() => {
          this.ask('scan-hover', entry.key);
        }}
        @mouseleave=${() => {
          this.ask('scan-hover', null);
        }}
      ></div>
    `;
  }

  override render() {
    const { view, frame } = this;
    if (view === null || frame === null) return nothing;
    return entriesOn(this.rows, this.image).map((e) =>
      this.renderEntry(e, view, frame)
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-entries': ScanEntriesElement;
  }
}
