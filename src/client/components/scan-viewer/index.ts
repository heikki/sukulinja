import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { fitTo, Pinch, startMomentumPan, zoomAt } from '@client/pan-zoom';
import type {
  MomentumHandle,
  Point,
  ScaleBounds,
  Transform,
  Viewport
} from '@client/pan-zoom';
import type { CitationRow, Scan } from '@common/types';

import { clampImage, imageUrl } from './helpers';
import { controlStyles, scanViewerStyles } from './styles';

import './toolbar';

export type { ScanMarked, ScanMarkedEvent } from './toolbar';

// The chart's feel (tree-view's VIEWPORT_OPTIONS), with room to zoom from a
// whole spread down to a page's detail.
const SCALE_BOUNDS: ScaleBounds = { minScale: 0.05, maxScale: 2 };
const WHEEL_ZOOM_K = 0.001;
const FIT = { maxScale: 1, marginPx: 16 };
const MOMENTUM = { tauMs: 250, minV: 0.02, minReleaseV: 0.3 };
const DRAG_THRESHOLD_PX = 4;
const ORIGIN: Point = { x: 0, y: 0 };

interface Sample {
  t: number;
  at: Point;
}

// Moves apply as deltas to the current view, so a refit or a zoom during
// the drag isn't undone by it.
interface Drag {
  start: Point;
  last: Point;
  moved: boolean;
  // The last two pointer samples, for the release velocity.
  samples: Sample[];
}

type Loading = 'loading' | 'shown' | 'failed';

// The Scan viewer: an Image of a Church-book reference's Volume over the
// chart, to step through, zoom into, and mark as where the record is. It
// opens on the Image the reference (`citation`) links (`scan`); a new `scan`
// moves it there. The record itself stays in the dock, marked there, so the
// toolbar holds only moving through the Volume and marking. Asks to close
// with a `scan-close` event; a mark reports with `scan-marked`.
@customElement('sl-scan-viewer')
export class ScanViewerElement extends LitElement {
  static override styles = [controlStyles, scanViewerStyles];

  @property({ attribute: false }) citation: CitationRow | null = null;
  @property({ attribute: false }) scan: Scan | null = null;

  @state() private image = 1;
  // Astia's viewer link for each Image of the Volume, which also gives their
  // count; null until it arrives.
  @state() private links: string[] | null = null;
  @state() private loading: Loading = 'loading';
  @state() private retry = 0;
  // Null until the first Image of the Volume is fitted.
  @state() private view: Transform | null = null;
  @state() private dragging = false;

  // The loaded Image's size: the next keeps the view when it matches.
  private natural: Viewport | null = null;
  private drag: Drag | null = null;
  private momentum: MomentumHandle | null = null;
  private readonly pinch = new Pinch({
    onZoom: (factor, at) => {
      this.zoomBy(factor, at);
    }
  });
  private linksAbort: AbortController | null = null;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
    this.stopMomentum();
    this.linksAbort?.abort();
  }

  override willUpdate(changed: PropertyValues<this>) {
    const scan = this.scan;
    if (!changed.has('scan') || scan === null) return;
    if (changed.get('scan')?.volumeId === scan.volumeId) {
      // A mark hands back the link to the Image already shown.
      this.show(scan.image);
      return;
    }
    this.natural = null;
    this.view = null;
    void this.loadLinks(scan.volumeId);
    this.image = clampImage(scan.image, null);
    this.loading = 'loading';
    this.retry = 0;
  }

  private async loadLinks(volumeId: string) {
    this.linksAbort?.abort();
    const abort = new AbortController();
    this.linksAbort = abort;
    this.links = null;
    try {
      const res = await fetch(`/astia/volumes/${volumeId}/images`, {
        signal: abort.signal
      });
      if (!res.ok) throw new Error(String(res.status));
      this.links = (await res.json()) as string[];
      this.image = clampImage(this.image, this.links.length);
    } catch {
      // Without the list the count stays unknown and Astia unlinked.
    }
  }

  private show(n: number) {
    const next = clampImage(n, this.links?.length ?? null);
    if (next === this.image) return;
    this.image = next;
    this.loading = 'loading';
    this.retry = 0;
  }

  private close() {
    this.dispatchEvent(
      new CustomEvent('scan-close', { bubbles: true, composed: true })
    );
  }

  // ------------------------------------------------------------ view

  private stageSize(): Viewport | null {
    const stage = this.renderRoot.querySelector<HTMLElement>('.stage');
    return stage === null
      ? null
      : { width: stage.clientWidth, height: stage.clientHeight };
  }

  private fitted() {
    const size = this.stageSize();
    const image = this.natural;
    if (size === null || image === null) return null;
    const extents = { min: ORIGIN, max: { x: image.width, y: image.height } };
    return fitTo(extents, ORIGIN, size, FIT);
  }

  private toStage(client: Point): Point {
    const rect = this.renderRoot
      .querySelector<HTMLElement>('.stage')!
      .getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  // At a point in client coordinates; stops a pan's glide, not a pinch's.
  private zoomBy(factor: number, at: Point) {
    if (this.view === null) return;
    this.stopPan();
    this.view = zoomAt(this.view, this.toStage(at), factor, SCALE_BOUNDS);
  }

  private readonly onLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const same =
      this.natural?.width === size.width && this.natural.height === size.height;
    this.natural = size;
    if (!same || this.view === null) this.view = this.fitted();
    this.loading = 'shown';
    // Shown fitted, a scan is drawn from a scaled-down decode; decoding it at
    // full size now keeps the first zoom in from stalling on that.
    img.decode().catch(() => undefined);
  };

  private readonly onError = () => {
    this.loading = 'failed';
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.pinch.wheel(e)) return;
    this.pinch.cancel();
    const at = { x: e.clientX, y: e.clientY };
    this.zoomBy(Math.exp(-e.deltaY * WHEEL_ZOOM_K), at);
  };

  // Toggles between the whole Image and 100% at the pointer.
  private readonly onDblClick = (e: MouseEvent) => {
    const fit = this.fitted();
    if (this.view === null || fit === null) return;
    this.stopMomentum();
    this.view =
      Math.abs(this.view.scale - fit.scale) > 1e-3
        ? fit
        : zoomAt(
            this.view,
            this.toStage({ x: e.clientX, y: e.clientY }),
            1 / this.view.scale,
            SCALE_BOUNDS
          );
  };

  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || this.view === null) return;
    e.preventDefault();
    this.stopMomentum();
    const at = { x: e.clientX, y: e.clientY };
    this.drag = {
      start: at,
      last: at,
      moved: false,
      samples: [{ t: performance.now(), at }]
    };
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    const drag = this.drag;
    if (drag === null || this.view === null) return;
    const at = { x: e.clientX, y: e.clientY };
    const away = Math.hypot(at.x - drag.start.x, at.y - drag.start.y);
    if (!drag.moved && away < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    this.dragging = true;
    drag.samples = [...drag.samples.slice(-1), { t: performance.now(), at }];
    const { pan } = this.view;
    this.view = {
      ...this.view,
      pan: { x: pan.x + at.x - drag.last.x, y: pan.y + at.y - drag.last.y }
    };
    drag.last = at;
  };

  private readonly onMouseUp = () => {
    const drag = this.drag;
    if (drag === null) return;
    this.drag = null;
    this.dragging = false;
    if (drag.moved) this.glide(drag.samples);
  };

  private glide(samples: Sample[]) {
    const [prev, last] = samples;
    if (prev === undefined || last === undefined) return;
    const dt = last.t - prev.t;
    if (dt <= 0) return;
    const v = {
      x: (last.at.x - prev.at.x) / dt,
      y: (last.at.y - prev.at.y) / dt
    };
    this.momentum = startMomentumPan(v.x, v.y, MOMENTUM, {
      onTick: (dx, dy) => {
        if (this.view === null) return;
        const { pan } = this.view;
        this.view = { ...this.view, pan: { x: pan.x + dx, y: pan.y + dy } };
      },
      onEnd: () => {
        this.momentum = null;
      }
    });
  }

  private stopPan() {
    this.momentum?.cancel();
    this.momentum = null;
  }

  // Both glides: a new gesture takes over from either.
  private stopMomentum() {
    this.stopPan();
    this.pinch.cancel();
  }

  // ←/→ step through the Volume unless typing an image number; Esc closes.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.close();
      return;
    }
    if (e.composedPath()[0] instanceof HTMLInputElement) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    this.show(this.image + (e.key === 'ArrowLeft' ? -1 : 1));
  };

  // ------------------------------------------------------------ render

  private renderToolbar(scan: Scan) {
    return html`
      <sl-scan-toolbar
        .citation=${this.citation}
        .link=${scan}
        .image=${this.image}
        .count=${this.links?.length ?? null}
        .astia=${this.links?.[this.image - 1] ?? null}
        ?ready=${this.loading === 'shown'}
        ?busy=${this.loading === 'loading' && this.view !== null}
        @scan-show=${(e: CustomEvent<number>) => {
          this.show(e.detail);
        }}
      ></sl-scan-toolbar>
    `;
  }

  private renderNote() {
    if (this.loading === 'failed') {
      return html`
        <div class="note">
          <span>Image unavailable</span>
          <button
            @click=${() => {
              this.retry += 1;
              this.loading = 'loading';
            }}
          >
            Retry
          </button>
        </div>
      `;
    }
    if (this.loading === 'loading' && this.view === null) {
      return html`<div class="note">Loading image…</div>`;
    }
    return nothing;
  }

  private renderStage(scan: Scan) {
    const v = this.view;
    const hidden = v === null || this.loading === 'failed';
    const style =
      v === null
        ? ''
        : `transform: translate(${v.pan.x}px, ${v.pan.y}px) scale(${v.scale})`;
    return html`
      <div
        class="stage ${this.dragging ? 'dragging' : ''}"
        @mousedown=${this.onMouseDown}
        @wheel=${this.onWheel}
        @gesturestart=${this.pinch.onGestureStart}
        @gesturechange=${this.pinch.onGestureChange}
        @gestureend=${this.pinch.onGestureEnd}
        @dblclick=${this.onDblClick}
      >
        <img
          class=${hidden ? 'unfitted' : ''}
          src=${imageUrl(scan.volumeId, this.image, this.retry)}
          alt=${`Image ${this.image}`}
          draggable="false"
          style=${style}
          @load=${this.onLoad}
          @error=${this.onError}
        />
        ${this.renderNote()}
      </div>
    `;
  }

  override render() {
    const scan = this.scan;
    if (scan === null) return nothing;
    return html` ${this.renderToolbar(scan)} ${this.renderStage(scan)} `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-viewer': ScanViewerElement;
  }
}
