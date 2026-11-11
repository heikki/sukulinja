// Panning and zooming a picture on a stage, as the Scan viewer and the
// Photo viewer do: a drag pans it with the chart's feel, the wheel and a
// pinch zoom, a double-click toggles between the whole picture and 100%,
// and the picture stays put on screen when the dock beside the viewer
// moves the stage's edge. Out, no further than the whole picture.

import type { ReactiveController, ReactiveControllerHost } from 'lit';

import { fitTo, Panning, Pinch } from '@/client/pan-zoom';
import type {
  Point,
  ScaleBounds,
  Transform,
  Viewport
} from '@/client/pan-zoom';

import { EdgeWatch } from './edge-watch';

// The chart's feel (tree-view's VIEWPORT_OPTIONS), with room to zoom in to a
// picture's detail; out, no further than the whole picture (scaleBounds).
const SCALE_BOUNDS: ScaleBounds = { minScale: 0.05, maxScale: 2 };
const WHEEL_ZOOM_K = 0.001;
// Fitted, the picture meets the stage's edges, at 100% at most unless the
// viewer says otherwise.
const FIT = { maxScale: 1, marginPx: 0 };
// The chart's feel.
const PANNING = {
  fling: { tauMs: 250, minV: 0.02, minReleaseV: 0.3, springMs: 60 },
  dragThresholdPx: 4,
  zoomSettleMs: 200
};
const ORIGIN: Point = { x: 0, y: 0 };

// What the viewer tells the stage.
export interface StageParts {
  // The element the picture is shown on.
  stage: () => HTMLElement | null;
  // The picture's size in pixels; null until it's known.
  size: () => Viewport | null;
  // How much of the stage's foot the whole picture leaves clear, for what
  // floats there; zoomed in, the picture's foot can rise clear of it too.
  footRoom: () => number;
  // How far past 100% a small picture is fitted; 1 by default.
  maxFit?: number;
}

// How the view moves when the picture shown changes: fitted anew, or
// scaled by `rescale` to stay put on screen.
export interface ViewChange {
  fit: boolean;
  rescale: number;
}

export class PictureStage implements ReactiveController {
  // Null until the picture is fitted.
  view: Transform | null = null;
  dragging = false;

  private readonly host: ReactiveControllerHost;
  private readonly parts: StageParts;
  private readonly panning: Panning;
  private readonly pinch: Pinch;
  private readonly edge: EdgeWatch;

  constructor(host: ReactiveControllerHost, parts: StageParts) {
    this.host = host;
    this.parts = parts;
    host.addController(this);
    this.panning = new Panning(
      {
        view: () => this.view,
        setView: (view) => {
          this.setView(view);
        },
        content: ({ pan, scale }) => {
          const size = parts.size();
          if (size === null) return null;
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
    this.pinch = new Pinch({
      onZoom: (factor, at) => this.zoomBy(factor, at),
      onEnd: () => {
        this.panning.zoomEnded();
      }
    });
    this.edge = new EdgeWatch(
      (dx) => {
        if (this.view === null) return;
        const { pan } = this.view;
        this.setView({ ...this.view, pan: { x: pan.x - dx, y: pan.y } });
      },
      () => {
        this.panning.keepWithin();
      }
    );
  }

  hostConnected() {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  hostDisconnected() {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.pinch.cancel();
    this.panning.dispose();
    this.edge.watch(null);
  }

  hostUpdated() {
    this.edge.watch(this.parts.stage());
  }

  private setView(view: Transform | null) {
    this.view = view;
    this.host.requestUpdate();
  }

  private stageSize(): Viewport | null {
    const stage = this.parts.stage();
    return stage === null
      ? null
      : { width: stage.clientWidth, height: stage.clientHeight };
  }

  // The stage, which a picture zoomed in on fills, but for its foot.
  private screen() {
    const size = this.stageSize();
    if (size === null) return null;
    const foot = { x: 0, y: this.parts.footRoom() };
    return { ...size, reach: { min: { x: 0, y: 0 }, max: foot } };
  }

  // The whole picture, above the room left at the stage's foot.
  fitted() {
    const size = this.stageSize();
    const picture = this.parts.size();
    if (size === null || picture === null) return null;
    const extents = {
      min: ORIGIN,
      max: { x: picture.width, y: picture.height }
    };
    const room = { ...size, height: size.height - this.parts.footRoom() };
    const maxScale = this.parts.maxFit ?? FIT.maxScale;
    return fitTo(extents, ORIGIN, room, { ...FIT, maxScale });
  }

  // The scale bounds, out no further than a fit of the whole picture:
  // smaller shows nothing more. A small picture fitted past the usual
  // furthest in can still be zoomed into as far again.
  private scaleBounds(): ScaleBounds {
    const fit = this.fitted();
    if (fit === null) return SCALE_BOUNDS;
    const maxScale = Math.max(SCALE_BOUNDS.maxScale, 2 * fit.scale);
    return { minScale: fit.scale, maxScale };
  }

  // A point in client coordinates, on the stage.
  toStage(client: Point): Point {
    const rect = this.parts.stage()!.getBoundingClientRect();
    return { x: client.x - rect.left, y: client.y - rect.top };
  }

  // At a point in client coordinates; stops a pan's glide, not a pinch's.
  private zoomBy(factor: number, at: Point) {
    return this.panning.zoomBy(factor, this.toStage(at));
  }

  // As the picture shown changes: fitted anew when asked or there's no
  // view yet, else scaled to stay put on screen; null hides it.
  placeView(change: ViewChange | null) {
    if (change === null) {
      this.setView(null);
      return;
    }
    const { view } = this;
    if (change.fit || view === null) {
      this.setView(this.fitted());
    } else if (change.rescale !== 1) {
      this.setView({ ...view, scale: view.scale * change.rescale });
    }
  }

  // Both glides: a new gesture takes over from either.
  stopMomentum() {
    this.panning.stop();
    this.pinch.cancel();
  }

  readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.pinch.wheel(e)) return;
    this.pinch.cancel();
    const at = { x: e.clientX, y: e.clientY };
    this.panning.wheel(Math.exp(-e.deltaY * WHEEL_ZOOM_K), this.toStage(at));
  };

  // Toggles between the whole picture and 100% at the pointer.
  readonly onDblClick = (e: MouseEvent) => {
    const fit = this.fitted();
    if (this.view === null || fit === null) return;
    this.stopMomentum();
    if (Math.abs(this.view.scale - fit.scale) > 1e-3) {
      this.setView(fit);
      return;
    }
    this.zoomBy(1 / this.view.scale, { x: e.clientX, y: e.clientY });
  };

  // A Ctrl-click is the Mac's right-click: it opens a menu, not a pan.
  readonly onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || this.view === null) return;
    e.preventDefault();
    this.stopMomentum();
    this.panning.start({ x: e.clientX, y: e.clientY });
  };

  private readonly onMouseMove = (e: MouseEvent) => {
    if (this.view === null) return;
    if (this.panning.move({ x: e.clientX, y: e.clientY }) && !this.dragging) {
      this.dragging = true;
      this.host.requestUpdate();
    }
  };

  private readonly onMouseUp = () => {
    this.panning.end();
    if (!this.dragging) return;
    this.dragging = false;
    this.host.requestUpdate();
  };

  readonly onGestureStart = (e: Event) => {
    this.pinch.onGestureStart(e);
  };

  readonly onGestureChange = (e: Event) => {
    this.pinch.onGestureChange(e);
  };

  readonly onGestureEnd = (e: Event) => {
    this.pinch.onGestureEnd(e);
  };
}
