import type { VolumeCitation } from '@/common/types';

import { imageOf } from './citations';

// The people listed beside the scan: their Citations link the Image shown,
// Marked, Match or Estimate. An entry isn't cited for them again.
export function citingImage(rows: VolumeCitation[], image: number) {
  return new Set(
    rows.filter((r) => imageOf(r) === image).map((r) => r.personId)
  );
}
