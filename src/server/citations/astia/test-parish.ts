// Test support: Juva's parish archive in an Astia of its own, so tests
// resolve citations without a request going out. Two rippikirja Volumes
// and a baptism one, of 20 Images each.

import { memoryAstia } from './memory-astia';

export const JUVA = '1212295491';
export const VOLUMES = {
  'juva-1': 'I Aa:1 Pää- ja rippikirjat (1790-1796)',
  'juva-2': 'I Aa:2 Pää- ja rippikirjat (1797-1803)',
  'juva-3': 'I C:1 Syntyneiden ja kastettujen luettelot (1790-1810)'
};
export const IMAGES = 20;

export function juvaAstia() {
  return memoryAstia({
    [JUVA]: {
      volumes: Object.entries(VOLUMES).map(([id, label]) => ({
        id,
        label,
        images: IMAGES
      }))
    }
  });
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
