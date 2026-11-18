// What a Vision Match search (find.ts) is given and gives back: the
// Volumes to search, the entry it confirmed or why none was, and whom it
// looks for. A find-entry "found" near the estimated Image confirms.

import type { Years } from '@/common/types';

import type { ChurchBookRef } from '../record';
import type { Fractions, Person } from './reader';

// How far from the estimated Image a search looks.
const WINDOW = 3;

// A Volume the existing resolution offers for the reference, with its
// number of Images, the years its label gives, and the Image it links when
// it knows one.
export interface Candidate {
  volumeId: string;
  volume: string;
  images: number;
  years: Years | null;
  start: number | null;
}

// Where the vision model confirmed the entry.
export interface Match {
  confirmed: true;
  volumeId: string;
  volume: string;
  image: number;
  // Where on the Image the entry is: a Match saves only with one.
  box: Fractions;
}

// Why a search confirmed no Match.
export type MissReason =
  | 'name not found'
  | 'unreadable'
  | 'no candidate volume'
  | 'no name'
  | 'no box';

// The Image and those around it, nearest first, as far as a search
// looks.
export function around(image: number, images: number) {
  const out = [image];
  for (let d = 1; d <= WINDOW; d++) {
    out.push(image + d, image - d);
  }
  return out.filter((n) => n >= 1 && n <= images);
}

// Whom the Reader looks for: the person a reference names, with what else
// it knows of them. `named` only where there are any, so a rippikirja
// reference asks as before, and its cached readings hold.
export function personOf(ref: ChurchBookRef, name: string): Person {
  return {
    name,
    date: ref.date,
    village: ref.places[0] ?? null,
    household: ref.household,
    ...(ref.named.length > 0 ? { named: ref.named } : {})
  };
}
