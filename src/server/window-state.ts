import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STATE_FILE = 'state.json';

export interface WindowFrame {
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

// Null covers both a first launch and a state.json that can't be read: either
// way the window opens at its default frame.
export function loadWindowFrame(dir: string) {
  try {
    const state = JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf-8')) as {
      window?: unknown;
    };
    return isFrame(state.window) ? state.window : null;
  } catch {
    return null;
  }
}

export function saveWindowFrame(dir: string, frame: WindowFrame) {
  mkdirSync(dir, { recursive: true });
  const { x, y, width, height } = frame;
  writeFileSync(
    join(dir, STATE_FILE),
    JSON.stringify({ window: { x, y, width, height } })
  );
}
