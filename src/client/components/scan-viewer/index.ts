import { html, LitElement, nothing } from 'lit';
import type { PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { apiUrl } from '@client/api';
import { fitTo, Pinch, startMomentumPan, zoomAt } from '@client/pan-zoom';
import type {
  MomentumHandle,
  Point,
  ScaleBounds,
  Transform,
  Viewport
} from '@client/pan-zoom';
import type {
  CitationRow,
  CitationVolume,
  PersonRow,
  Scan,
  VolumeCitation
} from '@common/types';

import { pickedScan } from './citations';
import type { ScanPerson } from './citations';
import { frameForFull, frameForThumb, layers } from './frame';
import type { Frame, Loading } from './frame';
import { clampImage, getJson, imageUrl, neighbours, thumbUrl } from './helpers';
import { Prefetch } from './prefetch';
import { controlStyles, scanViewerStyles } from './styles';

import './people';
import './toolbar';

export type { ScanPerson, ScanPersonEvent } from './citations';
export type { ScanMarked, ScanMarkedEvent } from './toolbar';

// The chart's feel (tree-view's VIEWPORT_OPTIONS), with room to zoom from a
// whole spread down to a page's detail.
const SCALE_BOUNDS: ScaleBounds = { minScale: 0.05, maxScale: 2 };
const WHEEL_ZOOM_K = 0.001;
const FIT = { maxScale: 1, marginPx: 16 };
const MOMENTUM = { tauMs: 250, minV: 0.02, minReleaseV: 0.3 };
const DRAG_THRESHOLD_PX = 4;
// A thumbnail seen for less than this gives way at once: the full Image was
// nearly there, and a fade would only flash the blur.
const FADE_AFTER_MS = 100;
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

// A Volume being shown: the link's, or one picked in the switcher.
interface Shown {
  id: string;
  label: string;
}

// The Scan viewer: an Image of a Church-book reference's Volumes over the
// chart, to step through, zoom into, and mark as where the record is. It
// opens on the Image the reference (`citation`) links (`scan`), and a new
// `scan` moves it there; without one, it waits for a Volume to be picked.
// The record itself stays in the dock, marked there, so the toolbar holds
// only moving through the Volumes and marking. Asks to close with a
// `scan-close` event; a mark reports with `scan-marked`. Beside the scan,
// the people of the tree (`persons`) linked to the Image shown; picking one
// asks to go on with their citation with `scan-person`.
@customElement('sl-scan-viewer')
export class ScanViewerElement extends LitElement {
  static override styles = [controlStyles, scanViewerStyles];

  @property({ attribute: false }) citation: CitationRow | null = null;
  @property({ attribute: false }) scan: Scan | null = null;
  @property({ attribute: false }) persons = new Map<number, PersonRow>();

  // The parish's Volumes for the switcher; null until they arrive.
  @state() private volumes: CitationVolume[] | null = null;
  @state() private volume: Shown | null = null;
  @state() private image = 1;
  // Astia's viewer link for each Image of the Volume, which also gives their
  // count; null until it arrives.
  @state() private links: string[] | null = null;
  @state() private loading: Loading = 'loading';
  @state() private retry = 0;
  // The shown Image's thumbnail, once loaded: shown blurred until the full
  // Image arrives.
  @state() private thumb: Viewport | null = null;
  // The full Image fading in over the thumbnail.
  @state() private fading = false;
  @state() private frame: Frame | null = null;
  // Null until the first Image of the Volume is fitted.
  @state() private view: Transform | null = null;
  @state() private dragging = false;
  // The shown Volume's citations; null until they arrive.
  @state() private citations: VolumeCitation[] | null = null;
  @state() private citationsFailed = false;

  // The Image last shown in each Volume of this reference, to go back to.
  private readonly left = new Map<string, number>();
  private readonly prefetch = new Prefetch();
  // Which way the last step went, for which neighbour to prefetch first.
  private step: 1 | -1 = 1;
  // When the shown Image's thumbnail appeared.
  private thumbAt = 0;
  private drag: Drag | null = null;
  private momentum: MomentumHandle | null = null;
  private readonly pinch = new Pinch({
    onZoom: (factor, at) => {
      this.zoomBy(factor, at);
    }
  });
  private linksAbort: AbortController | null = null;
  private volumesAbort: AbortController | null = null;
  private citationsAbort: AbortController | null = null;

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
    this.volumesAbort?.abort();
    this.citationsAbort?.abort();
    this.prefetch.keep([]);
  }

  override willUpdate(changed: PropertyValues<this>) {
    const id = this.citation?.id;
    if (changed.has('citation') && changed.get('citation')?.id !== id) {
      this.left.clear();
      if (id !== undefined) void this.loadVolumes(id);
    }
    if (changed.has('scan')) this.follow(this.scan);
  }

  // To the link's Image; a mark hands back the link to the Image shown.
  private follow(scan: Scan | null) {
    if (scan === null) {
      this.volume = null;
      return;
    }
    if (this.volume?.id === scan.volumeId) {
      this.show(scan.image);
    } else {
      this.open({ id: scan.volumeId, label: scan.volume }, scan.image);
    }
  }

  private async loadVolumes(id: number) {
    this.volumesAbort?.abort();
    const abort = new AbortController();
    this.volumesAbort = abort;
    this.volumes = null;
    try {
      const url = apiUrl(`/api/citations/${id}/volumes`);
      this.volumes = await getJson<CitationVolume[]>(url, abort.signal);
    } catch {
      // Without them there's nothing to switch to, and marking can't say how.
    }
  }

  private async loadLinks(volumeId: string) {
    this.linksAbort?.abort();
    const abort = new AbortController();
    this.linksAbort = abort;
    this.links = null;
    try {
      const url = `/astia/volumes/${volumeId}/images`;
      this.links = await getJson<string[]>(url, abort.signal);
      this.image = clampImage(this.image, this.links.length);
    } catch {
      // Without the list the count stays unknown and Astia unlinked.
    }
  }

  private async loadCitations(volumeId: string) {
    this.citationsAbort?.abort();
    const abort = new AbortController();
    this.citationsAbort = abort;
    this.citationsFailed = false;
    try {
      const url = apiUrl(`/api/volumes/${volumeId}/citations`);
      this.citations = await getJson<VolumeCitation[]>(url, abort.signal);
    } catch {
      if (!abort.signal.aborted) this.citationsFailed = true;
    }
  }

  private open(volume: Shown, image: number) {
    if (this.volume !== null) this.left.set(this.volume.id, this.image);
    this.volume = volume;
    this.frame = null;
    this.view = null;
    this.prefetch.keep([]);
    this.citations = null;
    void this.loadLinks(volume.id);
    void this.loadCitations(volume.id);
    this.image = clampImage(image, null);
    this.loading = 'loading';
    this.retry = 0;
    this.thumb = null;
    this.fading = false;
  }

  // Back where it was left, else on the reference's Image, else the first.
  private switchTo(id: string) {
    const volume = this.volumes?.find((v) => v.id === id);
    if (volume === undefined || id === this.volume?.id) return;
    const link = this.scan?.volumeId === id ? this.scan.image : null;
    const image = this.left.get(id) ?? link ?? volume.image ?? 1;
    this.open(volume, image);
  }

  private show(n: number) {
    const next = clampImage(n, this.links?.length ?? null);
    if (next === this.image) return;
    this.step = next < this.image ? -1 : 1;
    this.image = next;
    this.loading = 'loading';
    this.retry = 0;
    this.thumb = null;
    this.fading = false;
    const id = this.volume?.id;
    if (id === undefined) return;
    // The one now shown may already be on its way; the rest aren't wanted.
    const near = [next, ...neighbours(next, null, 1)];
    this.prefetch.keep(near.map((i) => imageUrl(id, i, 0)));
  }

  private prefetchNeighbours() {
    const id = this.volume?.id;
    if (id === undefined) return;
    const count = this.links?.length ?? null;
    const near = neighbours(this.image, count, this.step);
    this.prefetch.want(near.map((i) => imageUrl(id, i, 0)));
  }

  private close() {
    this.dispatchEvent(
      new CustomEvent('scan-close', { bubbles: true, composed: true })
    );
  }

  // A mark can change which Volumes the reference links, and where, and
  // moves its row, and an Anchor its neighbours'.
  private readonly onMarked = () => {
    if (this.citation !== null) void this.loadVolumes(this.citation.id);
    if (this.volume !== null) void this.loadCitations(this.volume.id);
  };

  private readonly onPick = (e: CustomEvent<VolumeCitation>) => {
    const row = e.detail;
    if (this.volume === null) return;
    const scan = pickedScan(row, this.volume, this.image, this.links);
    const open = { citation: row.citation, scan };
    const detail: ScanPerson = { personId: row.personId, open };
    this.dispatchEvent(
      new CustomEvent('scan-person', { detail, bubbles: true, composed: true })
    );
  };

  // ------------------------------------------------------------ view

  private stageSize(): Viewport | null {
    const stage = this.renderRoot.querySelector<HTMLElement>('.stage');
    return stage === null
      ? null
      : { width: stage.clientWidth, height: stage.clientHeight };
  }

  private fitted() {
    const size = this.stageSize();
    const image = this.frame?.size ?? null;
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

  private readonly onThumbLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const { frame, fit } = frameForThumb(this.frame, size);
    this.frame = frame;
    if (fit || this.view === null) this.view = this.fitted();
    this.thumb = size;
    this.thumbAt = performance.now();
  };

  private readonly onLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    const size = { width: img.naturalWidth, height: img.naturalHeight };
    const { frame, fit, rescale } = frameForFull(this.frame, size);
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
    this.loading = 'shown';
    this.prefetchNeighbours();
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

  private renderToolbar() {
    return html`
      <sl-scan-toolbar
        .citation=${this.citation}
        .link=${this.scan}
        .volumes=${this.volumes}
        .volume=${this.volume}
        .image=${this.image}
        .count=${this.links?.length ?? null}
        .astia=${this.links?.[this.image - 1] ?? null}
        ?ready=${this.loading === 'shown'}
        @scan-show=${(e: CustomEvent<number>) => {
          this.show(e.detail);
        }}
        @scan-volume=${(e: CustomEvent<string>) => {
          this.switchTo(e.detail);
        }}
        @scan-link=${() => {
          this.follow(this.scan);
        }}
        @scan-marked=${this.onMarked}
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
    if (this.loading !== 'loading') return nothing;
    // Over the last Image or the thumbnail, it waits a moment before showing,
    // so a cached Image doesn't flash it.
    return html`
      <div class="note">
        <span class="loading ${this.view === null ? '' : 'later'}">
          Loading image…
        </span>
      </div>
    `;
  }

  private renderImages(volume: Shown) {
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
        src=${thumbUrl(volume.id, this.image)}
        alt=""
        draggable="false"
        style=${shown.thumb === null ? '' : `transform: ${shown.thumb}`}
        @load=${this.onThumbLoad}
      />
      <img
        class=${shown.full === null ? 'hidden' : shown.fade ? 'fade' : ''}
        src=${imageUrl(volume.id, this.image, this.retry)}
        alt=${`Image ${this.image}`}
        draggable="false"
        style=${shown.frame === null ? '' : `transform: ${shown.frame}`}
        @load=${this.onLoad}
        @error=${this.onError}
        @transitionend=${() => {
          this.fading = false;
        }}
      />
    `;
  }

  private renderStage(volume: Shown) {
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
        ${this.renderImages(volume)} ${this.renderNote()}
      </div>
    `;
  }

  private renderPeople() {
    return html`
      <sl-scan-people
        .rows=${this.citations}
        .image=${this.image}
        .persons=${this.persons}
        .current=${this.citation?.id ?? null}
        ?failed=${this.citationsFailed}
        @scan-pick=${this.onPick}
      ></sl-scan-people>
    `;
  }

  override render() {
    if (this.citation === null) return nothing;
    return html`
      ${this.renderToolbar()}
      ${
        this.volume === null
          ? html`<div class="blank">
              <div class="note">Pick a Volume of the parish to look in.</div>
            </div>`
          : html`<div class="body">
              ${this.renderStage(this.volume)} ${this.renderPeople()}
            </div>`
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-viewer': ScanViewerElement;
  }
}
