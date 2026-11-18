// Astia for the e2e tests, so that they run where astia.narc.fi can't be
// reached and never depend on it: Juva's parish archive as the unit tests
// have it, under ids the app's routes take, its pages a picture of an
// invented church book page; and an invented parish's, to be found.

import { resolve } from 'node:path';

import { juvaAstia, VOLUMES } from '@/server/citations/testing';

export const BAPTISMS = '1000003';

// The invented parish no dataset cites, found in Astia by its name.
const KEKSITTY = {
  title: 'Keksityn seurakunnan arkisto',
  volumes: [
    { id: '2000001', label: 'I Aa:1 Rippikirja (1800-1810)', images: 5 }
  ]
};

export async function fixtureAstia() {
  const image = await Bun.file(
    resolve(import.meta.dir, 'fixtures/church-book-page.jpg')
  ).bytes();
  return juvaAstia(
    'Juvan seurakunnan arkisto',
    {
      '1000001': VOLUMES['juva-1'],
      '1000002': VOLUMES['juva-2'],
      [BAPTISMS]: VOLUMES['juva-3']
    },
    { image },
    { '2000000': KEKSITTY }
  );
}
