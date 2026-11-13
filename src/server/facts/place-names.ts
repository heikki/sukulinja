// How a place is written (ADR-0024): "(farm,) village, parish, Suomi",
// lowest first; Finland as Suomi, and its parishes by their Finnish names.
// MyHeritage and FamilySearch put a Finnish place's province (lääni)
// between its parish and the country, and a cemetery's region (maakunta):
// "Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland". The
// parish says which it is, so it's left out.

// Finland's provinces and regions, as the trees write them, in lower case.
const PROVINCES = new Set([
  'ahvenanmaa',
  'häme',
  'hämeenlinna',
  'kuopio',
  'kymi',
  'lappi',
  'mikkeli',
  'oulu',
  'turku ja pori',
  'uusimaa',
  'vaasa',
  'viipuri',
  'central finland',
  'etelä-karjala',
  'etelä-pohjanmaa',
  'etelä-savo',
  'kainuu',
  'kanta-häme',
  'keski-pohjanmaa',
  'keski-suomi',
  'kymenlaakso',
  'north karelia',
  'northern savonia',
  'pirkanmaa',
  'pohjanmaa',
  'pohjois-karjala',
  'pohjois-pohjanmaa',
  'pohjois-savo',
  'päijät-häme',
  'satakunta',
  'south karelia',
  'southern savonia',
  'varsinais-suomi'
]);

const FINLAND = new Set(['finland', 'suomi']);

// Parishes the trees write another way, in lower case, as they're named;
// a rural parish as Astia names its archive's ("Mikkelin maaseurakunnan
// arkisto"), Heikki's choice (2026-11-13).
const PARISHES = new Map([
  ['pieksamaki', 'Pieksämäki'],
  ['pyhäjärvi pieksämäki', 'Pyhäjärvi, Pieksämäki'],
  ['mikkeli maaseurakunta', 'Mikkelin maaseurakunta'],
  ['sortavala maaseurakunta', 'Sortavalan maaseurakunta'],
  ['viipurin maaseurakunta', 'Viipurin maaseurakunta']
]);

// The name without its Swedish one after it: "Juva (Jockas)" is Juva.
function finnishOf(part: string) {
  return part.replace(/\s*\(.*\)$/u, '').trim();
}

// The parish as it's named, its parts: Finnish, and spelled one way.
function parishOf(part: string) {
  const name = finnishOf(part);
  return (PARISHES.get(name.toLocaleLowerCase()) ?? name).split(', ');
}

function isProvince(part: string) {
  return PROVINCES.has(finnishOf(part).toLocaleLowerCase());
}

// The parts without one named as the next above it: a parish's church
// village goes by the parish's name, "Haukivuori, Haukivuori".
function withoutRepeats(parts: string[]) {
  return parts.filter(
    (p, i) => p.toLocaleLowerCase() !== parts[i + 1]?.toLocaleLowerCase()
  );
}

// The place as it's written: a place in Finland says Suomi, leaves out
// the province it names before it when there's a parish or town before
// that, names its parish in Finnish and spelled one way, and a village
// named as its parish only once. Any other is as it is.
export function tidyPlace(place: string) {
  const parts = place.split(/\s*,\s*/u);
  const country = parts.at(-1)!;
  if (!FINLAND.has(country.toLocaleLowerCase())) return place;
  const above = parts.slice(0, -1);
  if (above.length >= 2 && isProvince(above.at(-1)!)) above.pop();
  const parish = above.pop();
  return [
    ...withoutRepeats([
      ...above,
      ...(parish === undefined ? [] : parishOf(parish))
    ]),
    'Suomi'
  ].join(', ');
}
