import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import type { Viewport } from '@/client/pan-zoom';
import { appState } from '@/client/state';
import type { AppState } from '@/client/state';
import type { PhotoRow } from '@/common/types';

import { PictureStage } from '../box-stage/stage';
import { controlStyles, viewerStyles } from '../box-stage/styles';
import { photoBoxes } from './photo-boxes';

import '../box-stage/boxes';
import '../box-stage/toolbar';
import './edit';
import './layer';
import './people';

// ←/→ step through the Photos it was opened among.
const STEPS: Record<string, 1 | -1> = { ArrowLeft: -1, ArrowRight: 1 };

function typing(e: KeyboardEvent) {
  const on = e.composedPath()[0];
  return (
    on instanceof HTMLInputElement ||
    on instanceof HTMLTextAreaElement ||
    (on instanceof HTMLElement && on.isContentEditable)
  );
}

// The Photo viewer: a Photo of the Selected person's, or any picked in
// the Photos view, over the chart, to pan and zoom as the Scan viewer
// does. The Boxes of the people marked on
// it show as their rows beside it are hovered, the Selected person's
// while the pointer is on the Photo or a Tag is edited, so the Photo
// itself can be looked at; each Box and row leads to its person. A right-click tags someone
// there, or moves or removes a Tag (ADR-0017). Esc backs out of a Tag
// pending, else closes it, as the Photo clicked again in the panel does.
@customElement('sl-photo-viewer')
class PhotoViewerElement extends SignalWatcher(LitElement) {
  static override styles = [
    controlStyles,
    viewerStyles,
    css`
      sl-stage-boxes {
        --box-color: var(--accent);
      }
    `
  ];

  @consume({ context: appState }) private readonly state!: AppState;

  // The Photo drawn, and its size once it's loaded.
  private shown: PhotoRow | null = null;
  @state() private size: Viewport | null = null;
  @state() private failed = false;
  // The key of the person picked out, on the Photo and in the list.
  @state() private hovered: string | null = null;
  // The pointer is on the Photo.
  @state() private pointing = false;
  private focusing = false;

  private readonly stage = new PictureStage(this, {
    stage: () => this.renderRoot.querySelector('.stage'),
    size: () => this.size,
    footRoom: () => 0,
    // A small Photo fills the stage, as a scan does.
    maxFit: Infinity
  });

  // A region of its own, focused as it opens. Its keys work while it's
  // open, wherever focus is.
  override connectedCallback() {
    super.connectedCallback();
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Photo viewer');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    window.addEventListener('keydown', this.onKeyDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private get photo() {
    return this.state.photoViewer.opened.get();
  }

  // Another Photo starts loading from nothing: Photos differ in shape, so
  // each is fitted anew.
  override willUpdate() {
    const { photo } = this;
    if (photo?.id === this.shown?.id) {
      this.shown = photo;
      return;
    }
    this.focusing = this.shown === null;
    this.shown = photo;
    this.size = null;
    this.failed = false;
    this.hovered = null;
    this.stage.placeView(null);
  }

  override updated() {
    if (!this.focusing) return;
    this.focusing = false;
    this.focus({ preventScroll: true });
  }

  private readonly onLoad = (e: Event) => {
    const img = e.target as HTMLImageElement;
    this.size = { width: img.naturalWidth, height: img.naturalHeight };
    // Fitted once the stage has the size to fit.
    void this.updateComplete.then(() => {
      this.stage.placeView({ fit: true, rescale: 1 });
    });
  };

  private readonly onError = () => {
    this.failed = true;
  };

  // Every key handled here is marked so, or WKWebView hands it on to
  // macOS, which beeps at it. What lies over the viewer, a menu or a
  // corner popover, takes Esc first and stops it.
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const viewer = this.state.photoViewer;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.editing) viewer.cancel();
      else viewer.close();
      return;
    }
    const by = STEPS[e.key];
    if (by === undefined || typing(e)) return;
    e.preventDefault();
    this.state.photoViewer.step(by);
  };

  // A Tag pending, waiting to be taken back, or refused.
  private get editing() {
    const viewer = this.state.photoViewer;
    return (
      viewer.pending.get() !== null ||
      viewer.removing.get() !== null ||
      viewer.refused.get() !== null
    );
  }

  private readonly onPointerIn = () => {
    this.pointing = true;
  };

  private readonly onPointerOut = () => {
    this.pointing = false;
  };

  private readonly onHover = (e: CustomEvent<string | null>) => {
    this.hovered = e.detail;
  };

  private readonly onPick = (e: CustomEvent<string>) => {
    this.state.chart.select(Number(e.detail));
  };

  // The Photo's own menu in place of WebKit's, on the Box it's opened on,
  // if any.
  private readonly onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    this.stage.stopMomentum();
    const path = e.composedPath();
    const on = path.find(
      (t): t is HTMLElement =>
        t instanceof HTMLElement && t.dataset.key !== undefined
    );
    const pending = path.some(
      (t) =>
        t instanceof HTMLElement &&
        t.dataset.own === 'true' &&
        t.dataset.key === undefined
    );
    const at = this.stage.toStage({ x: e.clientX, y: e.clientY });
    this.renderRoot
      .querySelector('sl-photo-layer')
      ?.openMenu(at, { pending, key: on?.dataset.key ?? null });
  };

  // "Photo 2 of 3", of those it steps through.
  private heading(photo: PhotoRow) {
    const photos = this.state.photoViewer.among();
    const at = photos.findIndex((p) => p.id === photo.id);
    return at === -1 || photos.length < 2
      ? 'Photo'
      : `Photo ${at + 1} of ${photos.length}`;
  }

  private renderNote() {
    if (this.failed) {
      return html`<div class="note"><span>Photo unavailable</span></div>`;
    }
    if (this.size !== null) return nothing;
    return html`<div class="note">
      <span class="loading later">Loading photo…</span>
    </div>`;
  }

  private boxes(photo: PhotoRow) {
    const viewer = this.state.photoViewer;
    const selected =
      this.pointing || this.editing ? this.state.selected.id.get() : null;
    return photoBoxes(photo.people, selected, {
      pending: viewer.pending.get()?.personId ?? null,
      removing: viewer.removing.get()
    });
  }

  private renderEdit() {
    return this.editing ? html`<sl-photo-edit></sl-photo-edit>` : nothing;
  }

  private renderStage(photo: PhotoRow) {
    const { view } = this.stage;
    const at =
      view === null
        ? ''
        : `transform: translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.scale})`;
    return html`
      <div
        class="stage ${this.stage.dragging ? 'dragging' : ''}"
        @mousedown=${this.stage.onMouseDown}
        @mouseenter=${this.onPointerIn}
        @mouseleave=${this.onPointerOut}
        @wheel=${this.stage.onWheel}
        @gesturestart=${this.stage.onGestureStart}
        @gesturechange=${this.stage.onGestureChange}
        @gestureend=${this.stage.onGestureEnd}
        @dblclick=${this.stage.onDblClick}
        @contextmenu=${this.onContextMenu}
      >
        <img
          class=${view === null ? 'hidden' : ''}
          src=${this.state.api.mediaUrl(photo.path)}
          alt="Photo"
          draggable="false"
          style=${at}
          @load=${this.onLoad}
          @error=${this.onError}
        />
        ${
          view === null
            ? nothing
            : html`<sl-stage-boxes
                live
                .boxes=${this.boxes(photo)}
                .view=${view}
                .hovered=${this.hovered}
                @box-hover=${this.onHover}
                @box-pick=${this.onPick}
              ></sl-stage-boxes>`
        }
        ${this.renderNote()}
        <sl-photo-layer
          .photo=${photo}
          .view=${view}
          .size=${view === null ? null : this.size}
        ></sl-photo-layer>
        ${this.renderEdit()}
      </div>
    `;
  }

  override render() {
    const { photo } = this;
    if (photo === null) return nothing;
    return html`
      <sl-viewer-toolbar heading=${this.heading(photo)}></sl-viewer-toolbar>
      <div class="body">
        ${this.renderStage(photo)}
        <sl-photo-people
          .people=${photo.people}
          .hovered=${this.hovered}
          @box-hover=${this.onHover}
        ></sl-photo-people>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sl-photo-viewer': PhotoViewerElement;
  }
}
