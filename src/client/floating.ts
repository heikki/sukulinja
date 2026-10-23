import { css } from 'lit';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Point } from '@/client/pan-zoom';

// Where each kind of panel was last dragged to, for the rest of the visit,
// so the next one opens there.
const placed = new Map<string, Point>();

// How much of a panel stays on screen, so it can be grabbed back.
const KEEP_PX = 48;

// What a press on is for the control, not for dragging.
const CONTROLS = 'button, input, textarea, select, a, label';

// A panel floating over everything without blocking what's under it: the
// host's `[popover]` element, shown in the top layer once it's drawn and
// centred until it's dragged by `grip`, put on the panel itself. Panels of the same `kind` share
// where they were last dragged to.
export class Floating implements ReactiveController {
  private drag: { pointer: number; offset: Point } | null = null;

  constructor(
    private readonly host: ReactiveControllerHost & {
      renderRoot: ParentNode;
    },
    private readonly kind: string
  ) {
    host.addController(this);
  }

  private panel() {
    return this.host.renderRoot.querySelector<HTMLElement>('[popover]');
  }

  hostUpdated() {
    const panel = this.panel();
    if (panel === null || panel.matches(':popover-open')) return;
    panel.showPopover();
    const at = placed.get(this.kind);
    if (at !== undefined) this.place(at);
  }

  // At `at`, its top-left corner, kept where its heading can be reached.
  private place(at: Point) {
    const panel = this.panel();
    if (panel === null) return;
    const x = Math.min(
      Math.max(at.x, KEEP_PX - panel.offsetWidth),
      innerWidth - KEEP_PX
    );
    const y = Math.min(Math.max(at.y, 0), innerHeight - KEEP_PX);
    panel.style.inset = 'auto';
    panel.style.margin = '0';
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    placed.set(this.kind, { x, y });
  }

  // A press on the panel's background starts a drag, followed until the
  // pointer's let go; one on a control, or on a scrollbar, does what it
  // does.
  readonly grip = (e: PointerEvent) => {
    const panel = this.panel();
    if (e.button !== 0 || panel === null) return;
    const path = e.composedPath();
    const pressed = path.slice(0, path.indexOf(panel));
    const control = pressed.some(
      (n) => n instanceof Element && n.matches(CONTROLS)
    );
    if (control) return;
    const on = e.target as HTMLElement;
    if (e.offsetX > on.clientWidth || e.offsetY > on.clientHeight) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.drag = { pointer: e.pointerId, offset };
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    handle.addEventListener('pointermove', this.onMove);
    handle.addEventListener('pointerup', this.onUp);
    handle.addEventListener('pointercancel', this.onUp);
  };

  private readonly onMove = (e: PointerEvent) => {
    if (this.drag?.pointer !== e.pointerId) return;
    const { offset } = this.drag;
    this.place({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  private readonly onUp = (e: PointerEvent) => {
    const handle = e.currentTarget as HTMLElement;
    handle.removeEventListener('pointermove', this.onMove);
    handle.removeEventListener('pointerup', this.onUp);
    handle.removeEventListener('pointercancel', this.onUp);
    this.drag = null;
  };
}

// A floating panel's own box: the card, centred until it's dragged by its
// background.
export const floatingStyles = css`
  [popover] {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(var(--panel-width, 32rem), calc(100vw - 2rem));
    height: fit-content;
    max-height: calc(100vh - 2rem);
    box-sizing: border-box;
    overflow: auto;
    color: var(--fg);
    cursor: move;
    user-select: none;
  }

  [popover] :is(button, input, textarea, select, a, label) {
    cursor: auto;
  }

  [popover] :is(button, a) {
    cursor: pointer;
  }
`;
