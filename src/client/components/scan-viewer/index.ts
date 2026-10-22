import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import { fitTo, Panning, Pinch } from '@client/pan-zoom';
import type { Point, ScaleBounds, Transform, Viewport } from '@client/pan-zoom';
import { appState } from '@client/state';
import type { AppState, LinkOpen } from '@client/state';

import { ImageArrival } from './arrival';
import type { ViewChange } from './arrival';
import { EdgeWatch } from './edge-watch';
import { entriesShown, layers } from './frame';
import { rowsShown } from './helpers';
import { stepOf } from './keys';
import { stageNote } from './note';
import { Prefetch } from './prefetch';
import { controlStyles, scanViewerStyles } from './styles';

import './empty';
import './entries';
import './layer';
import './nav';
import './people';
import './toolbar';

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
const ORIGIN: Point = { x: 0, y: 0 };

// The Scan viewer: the Image the viewer store shows, over the chart, to
// zoom into and step through its Volume. The record itself stays in the
// dock, marked there, so the toolbar only names the Volume, and the Image
// controls float over the scan. Beside the scan, the people of the tree
// linked to the Image shown; an entry can be cited for the Selected
// person's family. A source with no Link opens on no
// Volume, saying why, until one of its parish's is chosen.
@customElement('sl-scan-viewer')
export class ScanViewerElement extends SignalWatcher(LitElement) {
  static override styles = [controlStyles, scanViewerStyles];

  @consume({ context: appState }) private readonly state!: AppState;

  // What's drawn while the Image shown arrives, and the frame it's in.
  private readonly arrival = new ImageArrival(this, {
    imageUrl: (volumeId, image, retry) =>
      this.state.api.imageUrl(volumeId, image, retry),
    thumbUrl: (volumeId, image) => this.state.api.thumbUrl(volumeId, image),
    prefetch: new Prefetch(),
    placeView: (change) => {
      this.placeView(change);
    },
    failed: () => {
      void this.viewer.imageFailed();
    }
  });
  // Null until the first Image of the Volume is fitted.
  @state() private view: Transform | null = null;
  @state() private dragging = false;
  // The key of the entry picked out, on the scan and in the list.
  @state() private hovered: string | null = null;

  // The source last opened; a new one moves focus here once it's shown.
  private opened: LinkOpen | null = null;
  private focusing = false;
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
      this.panning.zoomEnded();
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
  }

  private get viewer() {
    return this.state.viewer;
  }

  private get image() {
    return this.viewer.image.get();
  }

  private get frame() {
    return this.arrival.frame;
  }

  // A new Volume or Image starts arriving, over the last Image until it
  // does, and a new source moves focus here.
  override willUpdate() {
    const volumeId = this.viewer.volume.get()?.id ?? null;
    const count = this.viewer.count.get();
    if (this.arrival.show(volumeId, this.image, count)) this.hovered = null;
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

  // As an arrival moves the view: fitted anew when it says so or there's
  // none yet, else scaled to stay put on screen.
  private placeView(change: ViewChange | null) {
    if (change === null) {
      this.view = null;
      return;
    }
    const { view } = this;
    if (change.fit || view === null) {
      this.view = this.fitted();
    } else if (change.rescale !== 1) {
      this.view = { ...view, scale: view.scale * change.rescale };
    }
  }

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
    const retry = () => {
      this.arrival.retry();
    };
    const { loading } = this.arrival;
    return stageNote(this.viewer, { loading, over: this.view !== null }, retry);
  }

  // The thumbnail, blurred, at `transform`; hidden without one.
  private renderThumb(transform: string | null) {
    const { thumb } = this.arrival;
    if (thumb === null) return nothing;
    return html`<img
      class="thumb ${transform === null ? 'hidden' : ''}"
      src=${thumb.url}
      alt=""
      draggable="false"
      style=${transform === null ? '' : `transform: ${transform}`}
    />`;
  }

  private renderImages() {
    const { frame } = this;
    const { thumb, loading, fading, drawnUrl } = this.arrival;
    const shown = layers(this.view, frame, {
      thumb: thumb?.size ?? null,
      loading,
      fading
    });
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
      ${this.renderThumb(shown.thumb)}
      ${
        drawnUrl === null
          ? nothing
          : html`<img
              class=${shown.full === null ? 'hidden' : shown.fade ? 'fade' : ''}
              src=${drawnUrl}
              alt=${`Image ${this.image}`}
              draggable="false"
              style=${shown.frame === null ? '' : `transform: ${shown.frame}`}
              @transitionend=${() => {
                this.arrival.fadeEnded();
              }}
            />`
      }
    `;
  }

  private readonly onHover = (e: CustomEvent<string | null>) => {
    this.hovered = e.detail;
  };

  // Boxes around the entries whose place is known, once the full Image is
  // shown; the source's own gives way to its change pending, but not to a
  // new Citation's.
  private renderEntries(source: LinkOpen) {
    if (!entriesShown(this.frame, this.arrival.loading)) return nothing;
    const { citations, pending } = this.viewer;
    const shown = rowsShown(citations.get(), source, pending.get());
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

  private renderStage(source: LinkOpen) {
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
        ${this.renderImages()} ${this.renderEntries(source)}
        ${this.renderNote()}
        <sl-scan-nav></sl-scan-nav>
        <sl-scan-layer
          .view=${this.view}
          .frame=${this.frame}
          ?canEdit=${entriesShown(this.frame, this.arrival.loading)}
        ></sl-scan-layer>
      </div>
    `;
  }

  private renderPeople() {
    return html`
      <sl-scan-people
        .hovered=${this.hovered}
        @scan-hover=${this.onHover}
      ></sl-scan-people>
    `;
  }

  override render() {
    const source = this.viewer.source.get();
    if (source === null) return nothing;
    const volume = this.viewer.volume.get();
    if (volume === null) {
      if (source.link !== null) return nothing;
      return html`
        <sl-scan-toolbar></sl-scan-toolbar>
        <div class="body">
          <sl-scan-empty
            .unlinked=${source.unlinked}
            .cited=${source.citation.cited}
          ></sl-scan-empty>
        </div>
      `;
    }
    return html`
      <sl-scan-toolbar></sl-scan-toolbar>
      <div class="body">${this.renderStage(source)} ${this.renderPeople()}</div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-viewer': ScanViewerElement;
  }
}
