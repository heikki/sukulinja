import type { Point } from './emit';

export interface ParsedView {
  focusId: number | null;
  gen: number | null;
  pan: Point | null;
  zoom: number | null;
}

export interface Bounds {
  maxGen: number;
  minZoom: number;
  maxZoom: number;
}

export interface BuildView {
  focusId: number;
  gen: number;
  pan: Point | null;
  zoom: number | null;
}

export interface Defaults {
  gen: number;
}

const FOCUS_HASH_RE = /^#\/person\/(?<id>\d+)(?:\?(?<query>.*))?$/u;
const INT_RE = /^-?\d+$/u;
const FLOAT_RE = /^-?\d+(?:\.\d+)?$/u;
const MIN_GEN = 1;
const EMPTY: ParsedView = {
  focusId: null,
  gen: null,
  pan: null,
  zoom: null
};

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}

function parseGen(raw: string | null, maxGen: number): number | null {
  if (raw === null || !INT_RE.test(raw)) return null;
  return clamp(parseInt(raw, 10), MIN_GEN, maxGen);
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

export function parseHashView(hash: string, bounds: Bounds): ParsedView {
  const m = FOCUS_HASH_RE.exec(hash);
  if (m === null) return { ...EMPTY };
  const focusId = parseInt(m.groups!.id!, 10);
  const params = new URLSearchParams(m.groups?.query ?? '');
  return {
    focusId,
    gen: parseGen(params.get('gen'), bounds.maxGen),
    // Pan slot reserved for slice 03.
    pan: null,
    zoom: parseZoom(params.get('zoom'), bounds.minZoom, bounds.maxZoom)
  };
}

// Manual string assembly (not URLSearchParams) so slice 03's `pan=x,y` keeps
// its comma un-encoded; comma in a hash query is RFC-legal and far more
// readable than `%2C`.
export function buildHash(view: BuildView, defaults: Defaults): string {
  const parts: string[] = [];
  if (view.gen !== defaults.gen) parts.push(`gen=${view.gen}`);
  if (view.zoom !== null) parts.push(`zoom=${formatZoom(view.zoom)}`);
  return parts.length === 0
    ? `#/person/${view.focusId}`
    : `#/person/${view.focusId}?${parts.join('&')}`;
}
