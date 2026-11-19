// The Volume picker's "Fits" lines: each of the Selected person's
// Expected entries in words, and the Volumes it fits.

import type { BookSuggestion, LifeStage } from '@/common/types';

import { yearsText } from './helpers';

const STAGES: Record<LifeStage, string> = {
  birth: 'Baptism',
  childhood: 'Childhood',
  life: 'Life',
  marriage: 'Marriage',
  death: 'Burial'
};

export interface FitLine {
  // "Baptism 1796 · Pieksämäki": what's expected, its years ("~" before
  // a life's that runs to the last year a Fact gives) and the parish of
  // the Volume nearest.
  why: string;
  suggestion: BookSuggestion;
  // Why no Volume fits: where it was looked for, or that no parish is
  // known for the person's places; null when one does.
  none: string | null;
}

function noneWhy({ expected, parishes, volumes }: BookSuggestion) {
  if (volumes.length > 0) return null;
  if (parishes.length > 0) {
    return `None digitized in ${parishes.map((p) => p.parish).join(', ')}`;
  }
  const place = expected.places[0];
  return place === undefined
    ? 'No place to look in'
    : `No parish known for ${place}`;
}

export function fitLines(suggestions: BookSuggestion[]): FitLine[] {
  return suggestions.map((suggestion) => {
    const { expected, volumes } = suggestion;
    const years = `${expected.estimated ? '~' : ''}${yearsText(expected.years)}`;
    const nearest = volumes.find((v) => v.near) ?? volumes[0];
    const why = [`${STAGES[expected.of]} ${years}`, nearest?.parish]
      .filter((s) => s !== undefined)
      .join(' · ');
    return { why, suggestion, none: noneWhy(suggestion) };
  });
}
