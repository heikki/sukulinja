// What the Scan viewer draws while an Image arrives: its thumbnail, blurred,
// until the full Image is decoded, which then fades in over it, and the
// frame the view is in. Images arrive out of order and some fail, so what's
// drawn is only ever the latest one asked for, and the last stays up until
// it's ready: WebKit draws an <img> blank while its new src loads or
// decodes. The element keeps pan and zoom; this tells it when an arrival
// should fit, rescale or clear the view.

import type { Viewport } from '@client/pan-zoom';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

import { frameForFull, frameForThumb } from './frame';
import type { Frame, Loading } from './frame';

// A thumbnail seen for less than this gives way at once: the full Image was
// nearly there, and a fade would only flash the blur.
export const FADE_AFTER_MS = 100;
// After a step, a thumbnail waits this long before taking over from the
// last Image: a cached Image is decoded by then, and the blur would only
// flash.
export const THUMB_GRACE_MS = 120;

export interface Clock {
  now: () => number;
  later: (ms: number, run: () => void) => void;
}

const REAL_CLOCK: Clock = {
  now: () => performance.now(),
  later: (ms, run) => {
    setTimeout(run, ms);
  }
};

// Loads and decodes the Image at `url` at full size, which also keeps the
// first zoom in from stalling on a scaled-down decode; rejects when it
// can't be had.
export async function decodeImage(url: string): Promise<Viewport> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

// How an arrival moves the view: fitted anew, or scaled to stay where it
// is on screen. Null clears it, with the frame.
export interface ViewChange {
  fit: boolean;
  rescale: number;
}

export interface ArrivalPorts {
  imageUrl: (volumeId: string, image: number, retry: number) => string;
  thumbUrl: (volumeId: string, image: number) => string;
  prefetch: {
    want: (urls: string[]) => void;
    keep: (urls: string[]) => void;
  };
  placeView: (change: ViewChange | null) => void;
  // The full Image couldn't be had: Astia may have re-scanned the Volume.
  failed: () => void;
  decode?: (url: string) => Promise<Viewport>;
  clock?: Clock;
}

// The Images beside `n` that exist, the one ahead of `step` first.
export function neighbours(n: number, count: number | null, step: 1 | -1) {
  const beside = [n + step, n - step];
  return beside.filter((i) => i >= 1 && (count === null || i <= count));
}

export class ImageArrival implements ReactiveController {
  loading: Loading = 'loading';
  // The shown Image's thumbnail, once it takes over: shown blurred until
  // the full Image arrives.
  thumb: { url: string; size: Viewport } | null = null;
  // The full Image fading in over the thumbnail.
  fading = false;
  // The full Image drawn, loaded and decoded. Until the next is, the last
  // one stays.
  drawnUrl: string | null = null;
  frame: Frame | null = null;

  private readonly decode: (url: string) => Promise<Viewport>;
  private readonly clock: Clock;
  private volumeId: string | null = null;
  private image = 1;
  private count: number | null = null;
  private retries = 0;
  // A new Volume's first Image is fitted afresh; until something of it
  // arrives, the last Volume's Image stays up.
  private refit = false;
  // The full Image and thumbnail wanted: an arrival of any other is late.
  private wanted: string | null = null;
  private wantedThumb: string | null = null;
  // Which way the last step went, for which neighbour to prefetch first.
  private step: 1 | -1 = 1;
  // When the Image was stepped to, and when its thumbnail took over.
  private steppedAt = 0;
  private thumbAt = 0;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly ports: ArrivalPorts
  ) {
    this.decode = ports.decode ?? decodeImage;
    this.clock = ports.clock ?? REAL_CLOCK;
    host.addController(this);
  }

  hostDisconnected() {
    this.ports.prefetch.keep([]);
    this.wanted = null;
    this.wantedThumb = null;
  }

  // The Image the viewer shows, of a Volume with `count` Images if known.
  // A new Volume or Image starts arriving afresh, over the last Image;
  // whether it did.
  show(volumeId: string | null, image: number, count: number | null) {
    const fresh = volumeId !== this.volumeId || image !== this.image;
    if (volumeId !== this.volumeId) {
      this.refit = true;
      if (volumeId === null) this.clearFrame();
      this.ports.prefetch.keep([]);
    } else if (image !== this.image) {
      this.step = image < this.image ? -1 : 1;
      // The one now shown may already be on its way; the rest aren't wanted.
      if (volumeId !== null) this.keepNear(volumeId, image);
    }
    this.volumeId = volumeId;
    this.image = image;
    this.count = count;
    if (fresh) {
      this.reset();
      this.loadThumb();
    }
    this.load();
    return fresh;
  }

  // Asks for the full Image again, past the last attempt's answer.
  retry() {
    this.retries += 1;
    this.loading = 'loading';
    this.load();
    this.host.requestUpdate();
  }

  fadeEnded() {
    this.fading = false;
    this.host.requestUpdate();
  }

  private reset() {
    this.steppedAt = this.clock.now();
    this.loading = 'loading';
    this.retries = 0;
    this.thumb = null;
    this.fading = false;
  }

  private keepNear(volumeId: string, image: number) {
    const near = [image, ...neighbours(image, null, 1)];
    this.ports.prefetch.keep(
      near.map((i) => this.ports.imageUrl(volumeId, i, 0))
    );
  }

  private prefetchNeighbours() {
    const { volumeId } = this;
    if (volumeId === null) return;
    const near = neighbours(this.image, this.count, this.step);
    this.ports.prefetch.want(
      near.map((i) => this.ports.imageUrl(volumeId, i, 0))
    );
  }

  // Starts on the full Image wanted, unless it's on its way already.
  private load() {
    const { volumeId } = this;
    const url =
      volumeId === null
        ? null
        : this.ports.imageUrl(volumeId, this.image, this.retries);
    if (url === this.wanted) return;
    this.wanted = url;
    if (url !== null) void this.loadFull(url);
  }

  private async loadFull(url: string) {
    const size = await this.decode(url).catch(() => null);
    if (this.wanted !== url) return;
    if (size === null) this.onError();
    else this.onFull(url, size);
  }

  private loadThumb() {
    const { volumeId } = this;
    const url =
      volumeId === null ? null : this.ports.thumbUrl(volumeId, this.image);
    this.wantedThumb = url;
    if (url !== null) void this.decodeThumb(url);
  }

  // One that can't be had leaves the last Image up until the full one.
  private async decodeThumb(url: string) {
    const size = await this.decode(url).catch(() => null);
    if (size !== null && this.wantedThumb === url) this.onThumb(url, size);
  }

  // Over the last Image it waits out the grace, in case the full one comes
  // first.
  private onThumb(url: string, size: Viewport) {
    if (this.loading !== 'loading') return;
    const wait =
      this.frame === null
        ? 0
        : this.steppedAt + THUMB_GRACE_MS - this.clock.now();
    if (wait <= 0) {
      this.showThumb(url, size);
      return;
    }
    this.clock.later(wait, () => {
      if (this.wantedThumb === url && this.loading === 'loading') {
        this.showThumb(url, size);
      }
    });
  }

  private clearFrame() {
    this.frame = null;
    this.ports.placeView(null);
  }

  // The frame a new Image arrives in: none for a new Volume's first.
  private takeFrame() {
    const last = this.refit ? null : this.frame;
    this.refit = false;
    return last;
  }

  private showThumb(url: string, size: Viewport) {
    const { frame, fit } = frameForThumb(this.takeFrame(), size);
    this.frame = frame;
    this.ports.placeView({ fit, rescale: 1 });
    this.thumb = { url, size };
    this.thumbAt = this.clock.now();
    this.host.requestUpdate();
  }

  private onFull(url: string, size: Viewport) {
    const { frame, fit, rescale } = frameForFull(this.takeFrame(), size);
    this.frame = frame;
    this.ports.placeView({ fit, rescale });
    // Over a thumbnail it fades in; a cached one just appears.
    this.fading =
      this.thumb !== null && this.clock.now() - this.thumbAt > FADE_AFTER_MS;
    this.drawnUrl = url;
    this.loading = 'shown';
    this.prefetchNeighbours();
    this.host.requestUpdate();
  }

  // A new Volume's failing leaves nothing of the last one up, and none is
  // drawn again while the next loads: stepping on past Images that fail
  // would flash it.
  private onError() {
    if (this.refit) this.clearFrame();
    this.drawnUrl = null;
    this.loading = 'failed';
    this.ports.failed();
    this.host.requestUpdate();
  }
}
