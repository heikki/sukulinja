import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { fitTo, Panning, Pinch } from '@client/pan-zoom';
import type { Point, ScaleBounds, Transform, Viewport } from '@client/pan-zoom';
import { appState } from '@client/state';
import type { AppState, LinkOpen, VolumeShown } from '@client/state';
import type { PersonRow } from '@common/types';

import { EdgeWatch } from './edge-watch';
import { entriesShown, frameForFull, frameForThumb, layers } from './frame';
import type { Frame, Loading } from './frame';
import { neighbours } from './helpers';
import { stepOf } from './keys';
import { loadingNote } from './note';
import { Prefetch } from './prefetch';
import { controlStyles, scanViewerStyles } from './styles';

import './entries';
import './layer';
import './nav';
import './people';
import './toolbar';

export type { ScanPerson, ScanPersonEvent } from './citations';

// The chart's feel (tree-view's VIEWPORT_OPTIONS), with room to zoom in to a
// page's detail; out, no further than the whole Image (scaleBounds).
const SCALE_BOUNDS: ScaleBounds = { minScale: 0.05, maxScale: 2 };
const WHEEL_ZOOM_K = 0.001;
// Fitted, the Image meets the stage's edges.
const FIT = { maxScale: 1, marginPx: 0 };
// The chart's feel.
const PANNING = {
  fling: { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 },
  dragThresholdPx: 4,
  zoomSettleMs: 200
};
// A thumbnail seen for less than this gives way at once: the full Image was
// nearly there, and a fade would only flash the blur.
const FADE_AFTER_MS = 100;
// After a step, a thumbnail waits this long before taking over from the
// last Image: a cached Image is decoded by then, and the blur would only
// flash.
const THUMB_GRACE_MS = 120;
const ORIGIN: Point = { x: 0, y: 0 };

// The Volume and Image last drawn.
interface Drawn {
  volumeId: string | null;
  image: number;
}

// The Scan viewer: the Image the viewer store shows, over the chart, to
// zoom into and step through its Volume. The record itself stays in the
// dock, marked there, so the toolbar only names the Volume, and the Image
// controls float over the scan. Beside the scan, the people of the tree
// (`persons`) linked to the Image shown.
@customElement('sl-scan-viewer')
export class ScanViewerElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanViewerStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  @state() private loading: Loading = 'loading';
  @state() private retry = 0;
  // The shown Image's thumbnail, once loaded: shown blurred until the full
  // Image arrives.
  @state() private thumb: Viewport | null = null;
  // The full Image fading in over the thumbnail.
  @state() private fading = false;
  // The full Image drawn: only ever one loaded and decoded, since WebKit
  // draws an <img> blank while its new src loads or decodes. Until the next
  // is ready, the last one stays.
  @state() private drawnUrl: string | null = null;
  @state() private frame: Frame | null = null;
  // Null until the first Image of the Volume is fitted.
  @state() private view: Transform | null = null;
  @state() private dragging = false;
  // The key of the entry picked out, on the scan and in the list.
  @state() private hovered: string | null = null;

  private readonly prefetch = new Prefetch();
  private drawn: Drawn = { volumeId: null, image: 1 };
  // A new Volume's first Image is fitted afresh; until something of it
  // arrives, the last Volume's Image stays up.
  private refit = false;
  // The full Image being loaded and decoded out of sight, and its URL.
  private pending: HTMLImageElement | null = null;
  private wanted: string | null = null;
  // The source last opened; a new one moves focus here once it's shown.
  private opened: LinkOpen | null = null;
  private focusing = false;
  // Which way the last step went, for which neighbour to prefetch first.
  private step: 1 | -1 = 1;
  // When the shown Image's thumbnail appeared, and when the Image was
  // stepped to.
  private thumbAt = 0;
  private steppedAt = 0;
  private readonly panning = new Panning(
    {
      view: () => this.view,
      setView: (view) => {
        this.view = view;
      },
      content: ({ pan, scale }) => {
        const size = this.frame?.size;
        if (size === undefined) return null;
        const max = {
          x: pan.x + scale * size.width,
          y: pan.y + scale * size.height
        };
        return { min: pan, max };
      },
      screen: () => this.screen(),
      scaleBounds: () => this.scaleBounds(),
      fit: () => this.fitted()
    },
    PANNING
  );
  private readonly pinch = new Pinch({
    onZoom: (factor, at) => this.zoomBy(factor, at),
    onEnd: () => {
      this.panning.settle();
    }
  });
  // The scan stays put on screen when the dock beside the viewer moves its
  // edge, then comes back within its bounds for the stage's new size.
  private readonly edge = new EdgeWatch(
    (dx) => {
      if (this.view === null) return;
      const { pan } = this.view;
      this.view = { ...this.view, pan: { x: pan.x - dx, y: pan.y } };
    },
    () => {
      this.panning.keepWithin();
    }
  );

  // A region of its own, focused when it opens a source and reached with
  // Tab. Its keys work while it's open, wherever focus is.
  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Scan viewer');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown);
    this.pinch.cancel();
    this.panning.dispose();
    this.edge.watch(null);
    this.prefetch.keep([]);
    this.pending = null;
    this.wanted = null;
  }

  private get viewer() {
    return this.state.viewer;
  }

  private get image() {
    return this.viewer.image.get();
  }

  // A new Volume or Image starts its drawing afresh, over the last Image
  // until it arrives, and a new source moves focus here.
  override willUpdate() {
    const volumeId = this.viewer.volume.get()?.id ?? null;
    const { image } = this;
    const last = this.drawn;
    this.drawn = { volumeId, image };
    if (volumeId !== last.volumeId) {
      this.refit = true;
      if (volumeId === null) this.clearFrame();
      this.prefetch.keep([]);
      this.reset();
    } else if (image !== last.image) {
      this.step = image < last.image ? -1 : 1;
      this.reset();
      // The one now shown may already be on its way; the rest aren't wanted.
      if (volumeId !== null) this.keepNear(volumeId, image);
    }
    this.load(volumeId);
    const source = this.viewer.source.get();
    if (source !== this.opened) {
      this.opened = source;
      this.focusing = source !== null;
    }
  }

  override updated() {
    if (this.focusing) {
      this.focusing = false;
      this.focus({ preventScroll: true });
    }
    this.edge.watch(this.renderRoot.querySelector('.stage'));
  }

  private reset() {
    this.steppedAt = performance.now();
    this.loading = 'loading';
    this.retry = 0;
    this.thumb = null;
    this.hovered = null;
    this.fading = false;
  }

  // Starts on the full Image wanted, unless it's on its way already: a new
  // Image, or a retry.
  private load(volumeId: string | null) {
    const url =
      volumeId === null
        ? null
        : this.state.api.imageUrl(volumeId, this.image, this.retry);
    if (url === this.wanted) return;
    this.wanted = url;
    if (url === null) {
      this.pending = null;
      return;
    }
    const img = new Image();
    this.pending = img;
    img.src = url;
    void this.decode(img, url);
  }

  // Decoded at full size, which also keeps the first zoom in from stalling
  // on a scaled-down decode. One superseded meanwhile is dropped.
  private async decode(img: HTMLImageElement, url: string) {
    try {
      await img.decode();
    } catch {
      if (this.pending === img) this.onError();
      return;
    }
    if (this.pending === img) this.onLoad(img, url);
  }

  private keepNear(volumeId: string, image: number) {
    const near = [image, ...neighbours(image, null, 1)];
    const { api } = this.state;
    this.prefetch.keep(near.map((i) => api.imageUrl(volumeId, i, 0)));
  }

  private prefetchNeighbours() {
    const id = this.viewer.volume.get()?.id;
    if (id === undefined) return;
    const near = neighbours(this.image, this.viewer.count.get(), this.step);
    this.prefetch.want(near.map((i) => this.state.api.imageUrl(id, i, 0)));
  }

  // ------------------------------------------------------------ view

  private stageSize(): Viewport | null {
    const stage = this.renderRoot.querySelector<HTMLElement>('.stage');
    return stage === null
      ? null
      : { width: stage.clientWidth, height: stage.clientHeight };
  }

  // The stage, which an Image zoomed in on fills, but for its foot: its last
  // lines can rise clear of the page nav.
  private screen() {
    const size = this.stageSize();
    if (size === null) return null;
    const nav = { x: 0, y: this.navRoom() };
    return { ...size, reach: { min: { x: 0, y: 0 }, max: nav } };
  }

  // The whole Image, above the page nav floating at the stage's foot: it may
  // lie over the Image zoomed in, but never over the whole of it.
  private fitted() {
    const size = this.stageSize();
    const image = this.frame?.size ?? null;
    if (size === null || image === null) return null;
    const extents = { min: ORIGIN, max: { x: image.width, y: image.height } };
    const room = { ...size, height: size.height - this.navRoom() };
    return fitTo(extents, ORIGIN, room, FIT);
  }

  // How much of the stage's foot the page nav takes, clear of the Image above
  // it by as much as it is of the foot below.
  private navRoom() {
    const stage = this.renderRoot.querySelector('.stage');
    const nav = this.renderRoot.querySelector('sl-scan-nav');
    if (stage === null || nav === null) return 0;
    const foot = stage.getBoundingClientRect().bottom;
    const { top, bottom, height } = nav.getBoundingClientRect();
    return height === 0 ? 0 : foot - top + (foot - bottom);
  }

  // The scale bounds, out no further than a fit of the whole Image:
  // smaller shows nothing more.
  private scaleBounds(): ScaleBounds {
    const fit = this.fitted();
    if (fit === null) return SCALE_BOUNDS;
    return { ...SCALE_BOUNDS, minScale: fit.scale };
  }

  private toStage(client: Point): Point {
    const rect = this.renderRoot
      .querySelector<HTMLElement>('.stage')!
      .getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  // At a point in client coordinates; stops a pan's glide, not a pinch's.
  private zoomBy(factor: number, at: Point) {
    return this.panning.zoomBy(factor, this.toStage(at));
  }

  // Over the last Image it waits out the grace, in case the full one comes
  // first.
  private readonly onThumbLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const wait =
      this.frame === null
        ? 0
        : this.steppedAt + THUMB_GRACE_MS - performance.now();
    if (wait <= 0) {
      this.showThumb(size);
      return;
    }
    const { wanted } = this;
    setTimeout(() => {
      if (this.wanted === wanted && this.loading === 'loading') {
        this.showThumb(size);
      }
    }, wait);
  };

  private clearFrame() {
    this.frame = null;
    this.view = null;
  }

  // The frame a new Image arrives in: none for a new Volume's first.
  private takeFrame() {
    const last = this.refit ? null : this.frame;
    this.refit = false;
    return last;
  }

  private showThumb(size: Viewport) {
    const { frame, fit } = frameForThumb(this.takeFrame(), size);
    this.frame = frame;
    if (fit || this.view === null) this.view = this.fitted();
    this.thumb = size;
    this.thumbAt = performance.now();
  }

  private onLoad(img: HTMLImageElement, url: string) {
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const { frame, fit, rescale } = frameForFull(this.takeFrame(), size);
    this.frame = frame;
    const view = this.view;
    if (fit || view === null) {
      this.view = this.fitted();
    } else if (rescale !== 1) {
      this.view = { ...view, scale: view.scale * rescale };
    }
    // Over a thumbnail it fades in; a cached one just appears.
    this.fading =
      this.thumb !== null && performance.now() - this.thumbAt > FADE_AFTER_MS;
    this.drawnUrl = url;
    this.loading = 'shown';
    this.prefetchNeighbours();
  }

  // A new Volume's failing leaves nothing of the last one up.
  private readonly onError = () => {
    if (this.refit) this.clearFrame();
    this.loading = 'failed';
  };

  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.pinch.wheel(e)) return;
    this.pinch.cancel();
    const at = { x: e.clientX, y: e.clientY };
    this.panning.wheel(Math.exp(-e.deltaY * WHEEL_ZOOM_K), this.toStage(at));
  };

  // Toggles between the whole Image and 100% at the pointer.
  private readonly onDblClick = (e: MouseEvent) => {
    const fit = this.fitted();
    if (this.view === null || fit === null) return;
    this.stopMomentum();
    if (Math.abs(this.view.scale - fit.scale) > 1e-3) {
      this.view = fit;
      return;
    }
    this.zoomBy(1 / this.view.scale, { x: e.clientX, y: e.clientY });
  };

  // A Ctrl-click is the Mac's right-click: it opens the menu, not a pan.
  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || this.view === null) return;
    e.preventDefault();
    this.stopMomentum();
    this.panning.start({ x: e.clientX, y: e.clientY });
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (this.view === null) return;
    if (this.panning.move({ x: e.clientX, y: e.clientY })) this.dragging = true;
  };

  private readonly onMouseUp = () => {
    this.panning.end();
    this.dragging = false;
  };

  // Both glides: a new gesture takes over from either.
  private stopMomentum() {
    this.panning.stop();
    this.pinch.cancel();
  }

  // Esc backs out one step: from a way out waiting on the pending Box back
  // to editing, from editing (dropping the Box, as Cancel does) or a
  // Discard waiting, else out of the viewer. The arrows step (see keys.ts). Every key handled here is
  // marked so, or WKWebView hands it on to macOS, which beeps at it.
  private editing() {
    return this.viewer.pending.get() !== null || this.viewer.discarding.get();
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.viewer.leaving.get()) void this.viewer.answer('keep');
      else if (this.editing()) this.viewer.cancel();
      else this.viewer.close();
      return;
    }
    const step = stepOf(e);
    if (step === null) return;
    e.preventDefault();
    if (step.image === undefined) {
      this.viewer.step(step.source!);
    } else {
      this.viewer.show(this.image + step.image);
    }
  };

  // The scan's own menu in place of WebKit's, except in the Image number,
  // where WebKit's has copy and paste. On the source's own entry Box it's
  // that Box's menu.
  private readonly onContextMenu = (e: MouseEvent) => {
    const path = e.composedPath();
    if (path[0] instanceof HTMLInputElement) return;
    e.preventDefault();
    this.stopMomentum();
    const at = this.toStage({ x: e.clientX, y: e.clientY });
    const onBox = path.some(
      (t) => t instanceof HTMLElement && t.dataset.own === 'true'
    );
    this.renderRoot.querySelector('sl-scan-layer')?.openMenu(at, onBox);
  };

  // ------------------------------------------------------------ render

  private renderNote() {
    return loadingNote(this.loading, this.view !== null, () => {
      this.retry += 1;
      this.loading = 'loading';
    });
  }

  private renderImages(volume: VolumeShown) {
    const { frame } = this;
    const { thumb, loading, fading } = this;
    const shown = layers(this.view, frame, { thumb, loading, fading });
    return html`
      ${
        shown.frame === null || frame === null
          ? nothing
          : html`<div
              class="frame"
              style="width: ${frame.size.width}px; height: ${
                frame.size.height
              }px; transform: ${shown.frame}"
            ></div>`
      }
      <img
        class="thumb ${shown.thumb === null ? 'hidden' : ''}"
        src=${this.state.api.thumbUrl(volume.id, this.image)}
        alt=""
        draggable="false"
        style=${shown.thumb === null ? '' : `transform: ${shown.thumb}`}
        @load=${this.onThumbLoad}
      />
      ${
        this.drawnUrl === null
          ? nothing
          : html`<img
              class=${shown.full === null ? 'hidden' : shown.fade ? 'fade' : ''}
              src=${this.drawnUrl}
              alt=${`Image ${this.image}`}
              draggable="false"
              style=${shown.frame === null ? '' : `transform: ${shown.frame}`}
              @transitionend=${() => {
                this.fading = false;
              }}
            />`
      }
    `;
  }

  private readonly onHover = (e: CustomEvent<string | null>) => {
    this.hovered = e.detail;
  };

  // Boxes around the entries whose place is known, once the full Image is
  // shown; the source's own gives way to its change pending.
  private renderEntries(source: LinkOpen) {
    if (!entriesShown(this.frame, this.loading)) return nothing;
    const rows = this.viewer.citations.get();
    const editing = this.viewer.pending.get() !== null;
    const shown = (Array.isArray(rows) ? rows : []).filter(
      (r) => !editing || r.citation.id !== source.citation.id
    );
    return html`
      <sl-scan-entries
        .rows=${shown}
        .image=${this.image}
        .view=${this.view}
        .frame=${this.frame}
        .hovered=${this.hovered}
        .current=${source.citation.id}
        ?discarding=${this.viewer.discarding.get()}
        @scan-hover=${this.onHover}
      ></sl-scan-entries>
    `;
  }

  private renderStage(source: LinkOpen, volume: VolumeShown) {
    return html`
      <div
        class="stage ${this.dragging ? 'dragging' : ''}"
        @mousedown=${this.onMouseDown}
        @wheel=${this.onWheel}
        @gesturestart=${this.pinch.onGestureStart}
        @gesturechange=${this.pinch.onGestureChange}
        @gestureend=${this.pinch.onGestureEnd}
        @dblclick=${this.onDblClick}
        @contextmenu=${this.onContextMenu}
      >
        ${this.renderImages(volume)} ${this.renderEntries(source)}
        ${this.renderNote()}
        <sl-scan-nav .persons=${this.persons}></sl-scan-nav>
        <sl-scan-layer
          .view=${this.view}
          .frame=${this.frame}
          ?canEdit=${entriesShown(this.frame, this.loading)}
          .persons=${this.persons}
        ></sl-scan-layer>
      </div>
    `;
  }

  private renderPeople() {
    return html`
      <sl-scan-people
        .persons=${this.persons}
        .hovered=${this.hovered}
        @scan-hover=${this.onHover}
      ></sl-scan-people>
    `;
  }

  override render() {
    const source = this.viewer.source.get();
    const volume = this.viewer.volume.get();
    if (source === null || volume === null) return nothing;
    return html`
      <sl-scan-toolbar></sl-scan-toolbar>
      <div class="body">
        ${this.renderStage(source, volume)} ${this.renderPeople()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-viewer': ScanViewerElement;
  }
}
