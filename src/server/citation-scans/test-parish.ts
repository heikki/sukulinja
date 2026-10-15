// Test support: a parish in Astia's disk cache, so tests resolve citations
// without a request going out. Juva's parish archive: two rippikirja
// Volumes and a baptism one, of 20 Images each.

import { createHash } from 'node:crypto';
import { join } from 'node:path';

const ARCHIVE = '1212295491';
export const VOLUMES = {
  'juva-1': 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  'juva-2': 'I Aa:2 Pää- ja rippikirjat (1797-1803)',
  'juva-3': 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1810)'
};
export const IMAGES = 20;

function unit(id: string, level: string, label: string) {
  return {
    name: 'UNIT',
    children: [
      { name: 'ID', tagData: id },
      { name: 'TASO', tagData: level },
      { name: 'LABEL', tagData: label },
      { name: 'DIGI', tagData: 'true' }
    ]
  };
}

function file(id: string) {
  return { name: 'FILE', children: [{ name: 'URL', tagData: id }] };
}

// Astia's answers, put in the data folder's Astia cache.
export async function seedParish(root: string) {
  const cacheDir = join(root, '.astia-cache');
  const answers: Record<string, unknown> = {
    [`ws/aineisto/readOne.php?id=${ARCHIVE}`]: {
      sisaltyvat: [unit('juva-register', 'series', 'I VÄESTÖREKISTERIARKISTO')]
    },
    'ws/aineisto/readOne.php?id=juva-register': {
      sisaltyvat: Object.entries(VOLUMES).map(([id, label]) =>
        unit(id, 'file', label)
      )
    }
  };
  for (const id of Object.keys(VOLUMES)) {
    const ns = Array.from({ length: IMAGES }, (_, i) => i + 1);
    answers[`ws/aineisto/digitoidut.php?id=${id}`] = {
      isot: ns.map((n) => file(`${id}-f${n}`)),
      pienet: ns.map((n) => file(`${id}-t${n}`))
    };
  }
  for (const [path, body] of Object.entries(answers)) {
    const key = createHash('sha1').update(path).digest('hex');
    // eslint-disable-next-line no-await-in-loop -- a handful of small files
    await Bun.write(join(cacheDir, `${key}.json`), JSON.stringify(body));
  }
}

// A rippikirja citation in the shape MyHeritage writes, of a made-up person.
export function rippiCitation(
  record: number,
  years: string,
  page: number | null,
  name = 'Matti Esimerkki'
) {
  return {
    page: `https://www.myheritage.fi/research/collection-10509/x?itemId=${record}&action=showRecord`,
    text: [
      name,
      `Kirja:Rippikirja, ${years}`,
      `Hallintoalue:Juva${page === null ? '' : `Sivu:${page}`}`
    ].join('\n')
  };
}

// A baptism index citation, of a made-up person.
export function baptismCitation(item: number, date: string, name: string) {
  return {
    page: `https://www.myheritage.fi/research/collection-30233/x?itemId=${item}`,
    text: `${name}\nRistiäiset: ${date} - Juva, Mikkeli, Finland`
  };
}
