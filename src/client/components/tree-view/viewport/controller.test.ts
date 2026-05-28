import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { Extents, Point } from '../emit';
import { ViewportController } from './controller';
import type { Size, ViewportMeasurements, ViewportOptions } from './controller';

// --- Test infrastructure ---------------------------------------------------

interface TestHost extends ReactiveControllerHost {
  updates: number;
}

function makeHost(): TestHost {
  const host: TestHost = {
    updates: 0,
    updateComplete: Promise.resolve(true),
    addController(_c: ReactiveController) {
      // no-op
    },
    removeController(_c: ReactiveController) {
      // no-op
    },
    requestUpdate() {
      host.updates += 1;
    }
  };
  return host;
}

class FakeMeasurements implements ViewportMeasurements {
  extents: Extents | null = null;
  size: Size | null = null;
  rect: DOMRect | null = null;
  chartExtents() {
    return this.extents;
  }
  canvasSize() {
    return this.size;
  }
  canvasRect() {
    return this.rect;
  }
}

const OPTIONS: ViewportOptions = {
  scaleBounds: { minScale: 0.25, maxScale: 2 },
  wheelZoomK: 0.001,
  fitOptions: { maxScale: 1, marginPx: 24 },
  momentumOptions: { tauMs: 250, minV: 0.02, minReleaseV: 0.3 },
  dragThresholdPx: 4,
  svgMarginPx: 24
};

const EXTENTS: Extents = {
  min: { x: -200, y: -150 },
  max: { x: 200, y: 150 }
};
const SIZE: Size = { width: 800, height: 600 };
const RECT: DOMRect = {
  left: 0,
  top: 0,
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
  x: 0,
  y: 0,
  toJSON: () => ({})
};

// Globals stubbed per-test. Bun runs without a DOM, so we synthesize the
// minimum the controller touches: window for the never-fired addEventListener
// in hostConnected, performance.now for drag-sample timestamps, RAF for
// momentum, and Element for the dblclick composedPath check.

let mockNow = 0;
let rafCallbacks: FrameRequestCallback[] = [];
let rafCancels = 0;

function flushRaf() {
  const cbs = rafCallbacks;
  rafCallbacks = [];
  for (const cb of cbs) cb(mockNow);
}

class FakeElement {
  classList: { contains: (s: string) => boolean };
  constructor(classes: string[]) {
    this.classList = { contains: (s) => classes.includes(s) };
  }
}

beforeEach(() => {
  mockNow = 1000;
  rafCallbacks = [];
  rafCancels = 0;
  const g = globalThis as Record<string, unknown>;
  g.window = {
    addEventListener: () => {
      // no-op
    },
    removeEventListener: () => {
      // no-op
    }
  };
  g.performance = { now: () => mockNow };
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
  g.cancelAnimationFrame = () => {
    rafCancels += 1;
  };
  g.Element = FakeElement;
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.performance;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  delete g.Element;
});

function setup(extents: Extents | null = EXTENTS, size: Size | null = SIZE) {
  const host = makeHost();
  const measurements = new FakeMeasurements();
  measurements.extents = extents;
  measurements.size = size;
  measurements.rect = RECT;
  const controller = new ViewportController(host, measurements, OPTIONS);
  return { host, measurements, controller };
}

function mouse(x: number, y: number, button = 0): MouseEvent {
  return { clientX: x, clientY: y, button } as unknown as MouseEvent;
}

function wheel(x: number, y: number, deltaY: number): WheelEvent {
  return {
    clientX: x,
    clientY: y,
    deltaY,
    preventDefault: () => {
      // no-op
    }
  } as unknown as WheelEvent;
}

function dblclickWithPath(path: object[]): MouseEvent {
  return { composedPath: () => path } as unknown as MouseEvent;
}

function fakeCanvas(): HTMLElement {
  return {
    addEventListener: () => {
      // no-op
    },
    removeEventListener: () => {
      // no-op
    }
  } as unknown as HTMLElement;
}

// --- Tests -----------------------------------------------------------------

describe('drag FSM', () => {
  test('mousedown then sub-threshold move keeps dragging=false', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    const startPan = { ...controller.pan };
    controller.onMouseDown(mouse(100, 100));
    controller.onMouseMove(mouse(102, 101));
    expect(controller.dragging).toBe(false);
    expect(controller.dragMoved).toBe(false);
    expect(controller.pan).toEqual(startPan);
  });

  test('move past threshold flips dragging and dragMoved; pan tracks delta', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    const startPan = { ...controller.pan };
    controller.onMouseDown(mouse(100, 100));
    controller.onMouseMove(mouse(110, 105));
    expect(controller.dragging).toBe(true);
    expect(controller.dragMoved).toBe(true);
    expect(controller.pan.x).toBe(startPan.x + 10);
    expect(controller.pan.y).toBe(startPan.y + 5);
  });

  test('subsequent moves accumulate against original mousedown anchor', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    const startPan = { ...controller.pan };
    controller.onMouseDown(mouse(0, 0));
    controller.onMouseMove(mouse(20, 0));
    controller.onMouseMove(mouse(50, 30));
    expect(controller.pan.x).toBe(startPan.x + 50);
    expect(controller.pan.y).toBe(startPan.y + 30);
  });

  test('mouseup with no movement does not kick off momentum', () => {
    const { controller } = setup();
    controller.onMouseDown(mouse(100, 100));
    controller.onMouseUp();
    expect(rafCallbacks.length).toBe(0);
  });

  test('mouseup after a fast drag kicks off momentum (RAF scheduled)', () => {
    const { controller } = setup();
    controller.onMouseDown(mouse(0, 0));
    mockNow = 1010;
    controller.onMouseMove(mouse(20, 0));
    mockNow = 1020;
    controller.onMouseMove(mouse(60, 0));
    controller.onMouseUp();
    expect(rafCallbacks.length).toBeGreaterThan(0);
  });
});

describe('momentum sample window', () => {
  test('only the last two samples determine release velocity', () => {
    const { controller } = setup();
    controller.onMouseDown(mouse(0, 0));
    // First move past threshold to start dragging.
    mockNow = 1010;
    controller.onMouseMove(mouse(10, 0));
    // Slow middle phase — these samples would dilute velocity if windowed.
    mockNow = 1110;
    controller.onMouseMove(mouse(11, 0));
    mockNow = 1210;
    controller.onMouseMove(mouse(12, 0));
    // Fast final flick, captured by the trailing window.
    mockNow = 1220;
    controller.onMouseMove(mouse(112, 0));
    const panBeforeMomentum = { ...controller.pan };
    controller.onMouseUp();
    expect(rafCallbacks.length).toBe(1);
    // First momentum tick: dt=0 against capture time, but the tick reads
    // the per-frame dt from performance.now relative to lastT (set inside
    // startMomentumPan to performance.now at start). Advance and flush:
    mockNow += 16;
    flushRaf();
    // Released velocity uses (112-12)/(1220-1210) = 10 px/ms for x.
    // dx after one 16ms tick = 10 * 16 = 160 px before decay.
    expect(controller.pan.x - panBeforeMomentum.x).toBeCloseTo(160, 0);
    expect(controller.pan.y - panBeforeMomentum.y).toBeCloseTo(0, 6);
  });
});

describe('beginRefocus + applyPendingPin', () => {
  test('after rebuild swaps extents, pinned chart point lands on the captured screen point', () => {
    const { controller, measurements } = setup();
    controller.ensureInitialPan();
    const pinScreen: Point = { x: 200, y: 150 };
    controller.beginRefocus(pinScreen);
    expect(controller.hasPendingPin).toBe(true);
    measurements.extents = {
      min: { x: -500, y: -400 },
      max: { x: 100, y: 50 }
    };
    controller.applyPendingPin();
    expect(controller.hasPendingPin).toBe(false);
    const resolved = controller.chartToScreen({ x: 0, y: 0 });
    expect(resolved).not.toBeNull();
    if (resolved === null) return;
    expect(resolved.x).toBeCloseTo(pinScreen.x, 6);
    expect(resolved.y).toBeCloseTo(pinScreen.y, 6);
  });

  test('beginRefocus(null) preserves any prior pending pin (caller had no fresh point)', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    controller.beginRefocus({ x: 100, y: 100 });
    expect(controller.hasPendingPin).toBe(true);
    controller.beginRefocus(null);
    expect(controller.hasPendingPin).toBe(true);
  });

  test('levels-change preservation: Focus stays at its current screen position across a rebuild', () => {
    const { controller, measurements } = setup();
    controller.ensureInitialPan();
    // Simulate the willUpdate path: capture Focus's screen pos using old
    // extents, then swap to wider extents, then applyPendingPin.
    const focusScreenBefore = controller.chartToScreen({ x: 0, y: 0 });
    expect(focusScreenBefore).not.toBeNull();
    if (focusScreenBefore === null) return;
    controller.beginRefocus(focusScreenBefore);
    measurements.extents = {
      min: { x: -1000, y: -800 },
      max: { x: 1200, y: 900 }
    };
    controller.applyPendingPin();
    const focusScreenAfter = controller.chartToScreen({ x: 0, y: 0 });
    expect(focusScreenAfter).not.toBeNull();
    if (focusScreenAfter === null) return;
    expect(focusScreenAfter.x).toBeCloseTo(focusScreenBefore.x, 6);
    expect(focusScreenAfter.y).toBeCloseTo(focusScreenBefore.y, 6);
  });
});

describe('wheel zoom', () => {
  test('zooms toward cursor; pan/scale match zoomAt contract', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    controller.attachCanvas(fakeCanvas());
    const cursor = { x: 600, y: 400 };
    // chart point currently under cursor — must remain under cursor after zoom.
    const cursorChart = {
      x: (cursor.x - controller.pan.x) / controller.scale + EXTENTS.min.x - 24,
      y: (cursor.y - controller.pan.y) / controller.scale + EXTENTS.min.y - 24
    };
    controller.onWheel(wheel(cursor.x, cursor.y, -200));
    const projected = controller.chartToScreen(cursorChart);
    expect(projected).not.toBeNull();
    if (projected === null) return;
    expect(projected.x).toBeCloseTo(cursor.x, 6);
    expect(projected.y).toBeCloseTo(cursor.y, 6);
    expect(controller.scale).toBeGreaterThan(1);
  });

  test('wheel mid-momentum cancels the running momentum', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    controller.attachCanvas(fakeCanvas());
    controller.onMouseDown(mouse(0, 0));
    mockNow = 1010;
    controller.onMouseMove(mouse(20, 0));
    mockNow = 1020;
    controller.onMouseMove(mouse(60, 0));
    controller.onMouseUp();
    expect(rafCallbacks.length).toBe(1);
    const cancelsBefore = rafCancels;
    controller.onWheel(wheel(400, 300, -100));
    expect(rafCancels).toBeGreaterThan(cancelsBefore);
  });
});

describe('dblclick fit', () => {
  test('fits chart to viewport; pan/scale match fitTo contract', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    controller.onDblClick(dblclickWithPath([]));
    // After fit, the chart center should map to the canvas center.
    const chartCenter: Point = {
      x: (EXTENTS.min.x + EXTENTS.max.x) / 2,
      y: (EXTENTS.min.y + EXTENTS.max.y) / 2
    };
    const projected = controller.chartToScreen(chartCenter);
    expect(projected).not.toBeNull();
    if (projected === null) return;
    expect(projected.x).toBeCloseTo(SIZE.width / 2, 6);
    expect(projected.y).toBeCloseTo(SIZE.height / 2, 6);
  });

  test('skips fit when composedPath contains a .node element', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    const panBefore = { ...controller.pan };
    const scaleBefore = controller.scale;
    const node = new FakeElement(['node']);
    controller.onDblClick(dblclickWithPath([node]));
    expect(controller.pan).toEqual(panBefore);
    expect(controller.scale).toBe(scaleBefore);
  });
});

describe('initial pan', () => {
  test('places Focus at canvas center; flips panReady', () => {
    const { controller } = setup();
    expect(controller.panReady).toBe(false);
    controller.ensureInitialPan();
    expect(controller.panReady).toBe(true);
    const focusScreen = controller.chartToScreen({ x: 0, y: 0 });
    expect(focusScreen).not.toBeNull();
    if (focusScreen === null) return;
    expect(focusScreen.x).toBeCloseTo(SIZE.width / 2, 6);
    expect(focusScreen.y).toBeCloseTo(SIZE.height / 2, 6);
  });

  test('idempotent: a second call does not move pan', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    const panAfterFirst = { ...controller.pan };
    controller.ensureInitialPan();
    expect(controller.pan).toEqual(panAfterFirst);
  });

  test('no-op when canvas size is unavailable', () => {
    const { controller } = setup(EXTENTS, null);
    controller.ensureInitialPan();
    expect(controller.panReady).toBe(false);
  });
});

describe('interactions', () => {
  test('beginRefocus mid-drag cancels momentum but leaves drag state alone', () => {
    const { controller } = setup();
    controller.ensureInitialPan();
    controller.onMouseDown(mouse(0, 0));
    mockNow = 1010;
    controller.onMouseMove(mouse(20, 0));
    expect(controller.dragging).toBe(true);
    controller.beginRefocus({ x: 100, y: 100 });
    // Mid-drag refocus should not abort the drag; only mouseup ends it.
    expect(controller.dragging).toBe(true);
    expect(controller.hasPendingPin).toBe(true);
  });

  test('refocus → rebuild → refocus: pending pin uses the latest target', () => {
    const { controller, measurements } = setup();
    controller.ensureInitialPan();
    controller.beginRefocus({ x: 100, y: 100 });
    // Before the first applyPendingPin runs, another refocus arrives.
    controller.beginRefocus({ x: 300, y: 200 });
    measurements.extents = {
      min: { x: -500, y: -400 },
      max: { x: 100, y: 50 }
    };
    controller.applyPendingPin();
    const projected = controller.chartToScreen({ x: 0, y: 0 });
    expect(projected).not.toBeNull();
    if (projected === null) return;
    expect(projected.x).toBeCloseTo(300, 6);
    expect(projected.y).toBeCloseTo(200, 6);
  });
});
