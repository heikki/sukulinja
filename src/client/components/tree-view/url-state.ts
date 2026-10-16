import type { Point } from './emit';

export interface ParsedView {
  focusId: number | null;
  // The person the dock shows, when not Focus.
  selectedId: number | null;
  pan: Point | null;
  zoom: number | null;
}

export interface Bounds {
  minZoom: number;
  maxZoom: number;
}

export interface BuildView {
  focusId: number;
  // Written only when it isn't Focus.
  selectedId?: number | null;
  pan: Point | null;
  zoom: number | null;
}

const FOCUS_HASH_RE = /^#\/person\/(?<id>\d+)(?:\?(?<query>.*))?$/u;
const INT_RE = /^-?\d+$/u;
const FLOAT_RE = /^-?\d+(?:\.\d+)?$/u;
const EMPTY: ParsedView = {
  focusId: null,
  selectedId: null,
  pan: null,
  zoom: null
};

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}

function parseZoom(
  raw: string | null,
  minZoom: number,
  maxZoom: number
): number | null {
  if (raw === null || !FLOAT_RE.test(raw)) return null;
  return clamp(parseFloat(raw), minZoom, maxZoom);
}

// Two decimals, trailing zeros stripped: 1 → "1", 1.5 → "1.5", 0.875 → "0.88".
function formatZoom(z: number): string {
  return z.toFixed(2).replace(/\.?0+$/u, '');
}

function parseId(raw: string | null) {
  return raw === null || !/^\d+$/u.test(raw) ? null : parseInt(raw, 10);
}

function parsePan(raw: string | null): Point | null {
  if (raw === null) return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const [xs, ys] = parts as [string, string];
  if (!INT_RE.test(xs) || !INT_RE.test(ys)) return null;
  return { x: parseInt(xs, 10), y: parseInt(ys, 10) };
}

function formatPan(p: Point): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

export function parseHashView(hash: string, bounds: Bounds): ParsedView {
  const m = FOCUS_HASH_RE.exec(hash);
  if (m === null) return { ...EMPTY };
  const focusId = parseInt(m.groups!.id!, 10);
  const params = new URLSearchParams(m.groups?.query ?? '');
  return {
    focusId,
    selectedId: parseId(params.get('sel')),
    pan: parsePan(params.get('pan')),
    zoom: parseZoom(params.get('zoom'), bounds.minZoom, bounds.maxZoom)
  };
}

// Manual string assembly (not URLSearchParams) so slice 03's `pan=x,y` keeps
// its comma un-encoded; comma in a hash query is RFC-legal and far more
// readable than `%2C`.
export function buildHash(view: BuildView): string {
  const parts: string[] = [];
  const sel = view.selectedId ?? view.focusId;
  if (sel !== view.focusId) parts.push(`sel=${sel}`);
  if (view.pan !== null) parts.push(`pan=${formatPan(view.pan)}`);
  if (view.zoom !== null) parts.push(`zoom=${formatZoom(view.zoom)}`);
  return parts.length === 0
    ? `#/person/${view.focusId}`
    : `#/person/${view.focusId}?${parts.join('&')}`;
}
