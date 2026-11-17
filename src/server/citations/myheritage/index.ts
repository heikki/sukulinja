// MyHeritage's Church-book references: read from a Citation's page and
// text, resolved to Astia's scans with the pins, and saved where one is (a
// Mark, a Match or a Discard). The rest of the Citations reach them only
// through here. It stays, as a MyHeritage export stays a way in (ADR-0030);
// a reference Marked at its entry still converts (ADR-0016). Page pins are
// kept here with the Record ranges and Record pins they're saved beside,
// though the Scan viewer's pages serve every Volume.

export { routeRescan, switchFilming } from './pins/rescans';
export type { KeptPins } from './pins/rescans';
export type { BoxAt, DiscardDone, MarkDone, MarkTarget } from './pins/pins';
export {
  BAPTISM_COLLECTION,
  churchBookRefOf,
  collectionOf,
  markKey,
  readRecord
} from './record';
export type { ChurchBookRef } from './record';
export { referencesOf } from './references';
export { openScanFolder } from './scans';
export type { Scans } from './scans';
export { claudeReader } from './vision/claude-reader';
export type { ClaudeReader } from './vision/claude-reader';
export { counting } from './vision/find';
export { pacedImages } from './vision/images';
export type { Region, Scan } from './vision/images';
export { cachedReader } from './vision/reader';
export type { Reader } from './vision/reader';
