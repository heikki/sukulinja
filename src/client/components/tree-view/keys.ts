// The chart's keys: the arrows step the Selected box, Enter makes its
// person Root and Space shows or hides the dock.

import { targetOf } from '@/client/quiet-keys';
import type { KeyTarget } from '@/client/quiet-keys';

import type { Step } from './steps';

export type ChartKey = Step | 'root' | 'dock';

const KEYS: Record<string, ChartKey> = {
  'ArrowUp': 'up',
  'ArrowDown': 'down',
  'ArrowLeft': 'left',
  'ArrowRight': 'right',
  'Enter': 'root',
  ' ': 'dock'
};

// Space and Enter, which press a button or link.
const PRESSES = new Set<ChartKey>(['root', 'dock']);

// These keep their keys while they hold focus.
const HOLDS_KEYS =
  '[role="dialog"], [role="menu"], sl-settings, sl-scan-viewer';

const MODIFIERS = ['metaKey', 'ctrlKey', 'altKey', 'shiftKey'] as const;

interface KeyPress {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// What a press on `on` does on the chart, if anything: nothing with a
// modifier held or in a field, and Space and Enter press a button or link
// instead. Only an arrow repeats while held.
export function chartKeyOf(press: KeyPress, on: KeyTarget) {
  if (MODIFIERS.some((m) => press[m])) return null;
  const key = KEYS[press.key];
  if (key === undefined || on === 'field') return null;
  if (PRESSES.has(key) && on === 'control') return null;
  return press.repeat && PRESSES.has(key) ? null : key;
}

// What a key pressed does on the chart: nothing while a dialog, a menu,
// Settings or the Scan viewer holds focus.
export function chartKeyFrom(e: KeyboardEvent) {
  const path = e.composedPath();
  if (path.some((at) => at instanceof Element && at.matches(HOLDS_KEYS))) {
    return null;
  }
  return chartKeyOf(e, targetOf(path[0]));
}
