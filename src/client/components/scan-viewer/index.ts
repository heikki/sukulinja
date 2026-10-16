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
  PersonRow,
  Scan,
  VolumeCitation
} from '@common/types';

import { pickedScan } from './citations';
import type { ScanPerson } from './citations';
import { MOMENTUM, releaseVelocity } from './drag';
import type { Drag, Sample } from './drag';
import { EdgeWatch } from './edge-watch';
import { entriesShown, frameForFull, frameForThumb, layers } from './frame';
import type { Frame, Loading } from './frame';
import { clampImage, imageUrl, Latest, neighbours, thumbUrl } from './helpers';
import { stepOf } from './keys';
import type { ScanClose, ScanStep } from './keys';
import { loadingNote } from './note';
import { Prefetch } from './prefetch';
import { controlStyles, scanViewerStyles } from './styles';

import './entries';
import './nav';
import './people';
import './toolbar';

export type { ScanPerson, ScanPersonEvent } from './citations';
export type { ScanCloseEvent, ScanStepEvent } from './keys';
export type { ScanMarked, ScanMarkedEvent } from './helpers';

// The chart's feel (tree-view's VIEWPORT_OPTIONS), with room to zoom from a
// whole spread down to a page's detail.
const SCALE_BOUNDS: ScaleBounds = { minScale: 0.05, maxScale: 2 };
const WHEEL_ZOOM_K = 0.001;
const FIT = { maxScale: 1, marginPx: 16 };
const DRAG_THRESHOLD_PX = 4;
// A thumbnail seen for less than this gives way at once: the full Image was
// nearly there, and a fade would only flash the blur.
const FADE_AFTER_MS = 100;
const ORIGIN: Point = { x: 0, y: 0 };

// The link's Volume, being shown.
interface Shown {
  id: string;
  label: string;
}

// The Scan viewer: the Image a Church-book reference (`citation`) links
// (`scan`) over the chart, in its Volume to step through and zoom into; a
// new `scan` moves it there. The record itself stays in the dock, marked
// there, so the toolbar only names the Volume, and the Image controls float
// over the scan. Asks to close
// with a `scan-close` event. Beside the scan, the people of the tree
// (`persons`) linked to the Image shown; picking one asks to go on with
// their citation with `scan-person`, and confirming one's vision match
// reports with `scan-marked`.
@customElement('sl-scan-viewer')
export class ScanViewerElement extends LitElement {
  static override styles = [controlStyles, scanViewerStyles];

  @property({ attribute: false }) citation: CitationRow | null = null;
  @property({ attribute: false }) scan: Scan | null = null;
  @property({ attribute: false }) persons = new Map<number, PersonRow>();

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
  // The key of the entry picked out, on the scan and in the list.
  @state() private hovered: string | null = null;

  private readonly prefetch = new Prefetch();
  // A source was opened, so focus moves here once it's shown.
  private focusing = false;
  // The Image shown isn't the link's; unknown until first shown, so a new
  // viewer always says.
  private away: boolean | null = null;
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
  // The scan stays put on screen when the dock beside the viewer moves its
  // edge.
  private readonly edge = new EdgeWatch((dx) => {
    if (this.view === null) return;
    const { pan } = this.view;
    this.view = { ...this.view, pan: { x: pan.x - dx, y: pan.y } };
  });
  private readonly linksReq = new Latest();
  private readonly citationsReq = new Latest();

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
    this.stopMomentum();
    this.edge.watch(null);
    this.linksReq.stop();
    this.citationsReq.stop();
    this.prefetch.keep([]);
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('scan')) {
      this.follow(this.scan);
      this.focusing = this.scan !== null;
    }
  }

  // Watches the scan's edge once there is one, and says with `scan-away`
  // whenever it leaves the link's Image, or comes back to it; a link to the
  // Volume alone holds anywhere in it.
  override updated() {
    if (this.focusing) {
      this.focusing = false;
      this.focus({ preventScroll: true });
    }
    this.edge.watch(this.renderRoot.querySelector('.stage'));
    const link = this.scan;
    const away =
      link !== null &&
      (this.volume?.id !== link.volumeId ||
        (link.method !== 'volume' && this.image !== link.image));
    if (away === this.away) return;
    this.away = away;
    this.dispatchEvent(
      new CustomEvent('scan-away', {
        detail: away,
        bubbles: true,
        composed: true
      })
    );
  }

  // To the link's Image; a confirmation hands back the link to the Image
  // shown.
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

  // Without the list the count stays unknown.
  private async loadLinks(volumeId: string) {
    this.links = null;
    const url = `/astia/volumes/${volumeId}/images`;
    const links = await this.linksReq.get<string[]>(url);
    if (links === null || links === undefined) return;
    this.links = links;
    this.image = clampImage(this.image, links.length);
  }

  private async loadCitations(volumeId: string) {
    this.citationsFailed = false;
    const url = apiUrl(`/api/volumes/${volumeId}/citations`);
    const rows = await this.citationsReq.get<VolumeCitation[]>(url);
    if (rows === undefined) return;
    this.citations = rows;
    this.citationsFailed = rows === null;
  }

  private open(volume: Shown, image: number) {
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
    this.hovered = null;
    this.fading = false;
  }

  private show(n: number) {
    const next = clampImage(n, this.links?.length ?? null);
    if (next === this.image) return;
    this.step = next < this.image ? -1 : 1;
    this.image = next;
    this.loading = 'loading';
    this.retry = 0;
    this.thumb = null;
    this.hovered = null;
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
    if (this.citation === null) return;
    this.tell('scan-close', { citationId: this.citation.id });
  }

  // Tells the host about the source shown.
  private tell(type: string, detail: ScanClose | ScanStep) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }

  // A confirmation moves its row, and an Anchor its neighbours'.
  private readonly onMarked = () => {
    if (this.volume !== null) void this.loadCitations(this.volume.id);
  };

  private readonly onPick = (e: CustomEvent<VolumeCitation>) => {
    const row = e.detail;
    if (this.volume === null) return;
    const scan = pickedScan(row, this.image, this.links);
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
    const v = releaseVelocity(samples);
    if (v === null) return;
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

  // Esc closes; the arrows step (see keys.ts).
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.close();
      return;
    }
    const step = stepOf(e);
    if (step === null) return;
    e.preventDefault();
    if (step.image !== undefined) {
      this.show(this.image + step.image);
    } else if (this.citation !== null) {
      // Asks the dock for the source before or after this one.
      this.tell('scan-step', {
        citationId: this.citation.id,
        step: step.source!
      });
    }
  };

  // ------------------------------------------------------------ render

  private renderToolbar() {
    return html`<sl-scan-toolbar
      .link=${this.scan}
      @scan-close=${() => {
        this.close();
      }}
    ></sl-scan-toolbar>`;
  }

  private renderNote() {
    return loadingNote(this.loading, this.view !== null, () => {
      this.retry += 1;
      this.loading = 'loading';
    });
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

  private readonly onHover = (e: CustomEvent<string | null>) => {
    this.hovered = e.detail;
  };

  // Boxes around the entries whose place is known, once the full Image is
  // shown.
  private renderEntries() {
    if (!entriesShown(this.frame, this.loading)) return nothing;
    return html`
      <sl-scan-entries
        .rows=${this.citations ?? []}
        .image=${this.image}
        .view=${this.view}
        .frame=${this.frame}
        .hovered=${this.hovered}
        .current=${this.citation?.id ?? null}
        @scan-pick=${this.onPick}
        @scan-hover=${this.onHover}
      ></sl-scan-entries>
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
        ${this.renderImages(volume)} ${this.renderEntries()}
        ${this.renderNote()}
        <sl-scan-nav
          .image=${this.image}
          .count=${this.links?.length ?? null}
          @scan-show=${(e: CustomEvent<number>) => {
            this.show(e.detail);
          }}
        ></sl-scan-nav>
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
        .hovered=${this.hovered}
        .volumeId=${this.volume?.id ?? null}
        ?failed=${this.citationsFailed}
        @scan-marked=${this.onMarked}
        @scan-pick=${this.onPick}
        @scan-hover=${this.onHover}
      ></sl-scan-people>
    `;
  }

  override render() {
    if (this.citation === null || this.volume === null) return nothing;
    return html`
      ${this.renderToolbar()}
      <div class="body">
        ${this.renderStage(this.volume)} ${this.renderPeople()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-scan-viewer': ScanViewerElement;
  }
}
