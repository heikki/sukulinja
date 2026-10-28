import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STATE_FILE = 'state.json';

interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isFrame(value: unknown): value is WindowFrame {
  if (typeof value !== 'object' || value === null) return false;
  const frame = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) =>
    Number.isFinite(frame[key])
  );
}

// An empty state covers both a first launch and a state.json that can't be
// read: either way the window opens at its default frame, on the chooser.
function load(dir: string) {
  try {
    const state: unknown = JSON.parse(
      readFileSync(join(dir, STATE_FILE), 'utf-8')
    );
    return typeof state === 'object' && state !== null
      ? (state as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function save(dir: string, key: string, value: unknown) {
  mkdirSync(dir, { recursive: true });
  const state = { ...load(dir), [key]: value };
  writeFileSync(join(dir, STATE_FILE), JSON.stringify(state));
}

export function loadWindowFrame(dir: string) {
  const frame = load(dir).window;
  return isFrame(frame) ? frame : null;
}

export function saveWindowFrame(dir: string, frame: WindowFrame) {
  const { x, y, width, height } = frame;
  save(dir, 'window', { x, y, width, height });
}

// The page the window was last on, as a path with its hash; null when none
// is saved.
export function loadLastView(dir: string) {
  const view = load(dir).view;
  return typeof view === 'string' ? view : null;
}

export function saveLastView(dir: string, view: string | null) {
  save(dir, 'view', view ?? undefined);
}
