// What asking the vision model did and took (ADR-0029, ADR-0032), as the
// operations report it.

import type { CitationLinks } from './types';

// What a Vision Match of one reference did (ADR-0029): its Links as they
// then resolve, and null when it saved a Match, else why it didn't.
export interface VisionTry {
  links: CitationLinks;
  missed: string | null;
}

// Every estimate on an Image looked for in one question (ADR-0029): each
// one's try; the questions it asked the model, how many of them earlier
// readings answered for nothing, what the rest cost, and how long it took.
// A page survey of a Volume (ADR-0032): how many Page pins it saved,
// whether its readings all agree, and what it took.
export interface VisionSurvey extends VisionTook {
  pinned: number;
  settled: boolean;
}

export interface VisionPageTry extends VisionTook {
  tries: VisionTry[];
}

// What asking the vision model took: the model, the questions it asked,
// how many of them earlier readings answered for nothing, what the rest
// cost, and how long it took.
export interface VisionTook {
  model: string;
  readings: number;
  cached: number;
  dollars: number | null;
  seconds: number;
}

// A line of the `locateVolume` operation (ADR-0032), as it goes: its page
// survey, where none of the Volume's pages are known, then the estimates
// looked for Image by Image, each Image's tries, and last what it all
// took, or why it stopped.
export type VolumeLocating =
  | { surveying: true }
  | { surveyed: VisionSurvey }
  | { searching: { nth: number; images: number; estimates: number } }
  | { tried: VisionTry[] }
  | { done: VisionTook | null }
  | { refused: string; took: VisionTook | null };
