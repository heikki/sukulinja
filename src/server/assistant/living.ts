// Who the assistant leaves out: anyone who may be living. No death,
// burial or cremation is recorded, and they were born within LIVING_YEARS,
// or no birth year is known to say they weren't.

import type { PersonRow } from '@/common/types';

export const LIVING_YEARS = 110;

export function mayBeLiving(
  p: Pick<PersonRow, 'died' | 'birth_year' | 'death_year'>,
  thisYear: number
) {
  if (p.died || p.death_year !== null) return false;
  return p.birth_year === null || p.birth_year > thisYear - LIVING_YEARS;
}
