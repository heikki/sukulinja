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

export function parseHashView(hash: string, bounds: Bounds): ParsedView {
  const m = FOCUS_HASH_RE.exec(hash);
  if (m === null) return { ...EMPTY };
  const focusId = parseInt(m.groups!.id!, 10);
  const params = new URLSearchParams(m.groups?.query ?? '');
  return {
    focusId,
    gen: parseGen(params.get('gen'), bounds.maxGen),
    // Pan and zoom slots reserved for later slices (02, 03).
    pan: null,
    zoom: null
  };
}

export function buildHash(view: BuildView, defaults: Defaults): string {
  const params = new URLSearchParams();
  if (view.gen !== defaults.gen) params.set('gen', String(view.gen));
  const q = params.toString();
  return q === ''
    ? `#/person/${view.focusId}`
    : `#/person/${view.focusId}?${q}`;
}
