// A tree in GEDCOM 5.5.1 the way MyHeritage and other programs write it,
// with media, for the export tests.

import type { DatasetRegistry } from '../src/server/dataset-registry';
import { packGedzip } from '../src/server/gedzip';

export const FIXTURE = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 LANG Finnish',
  '1 SUBM @U1@',
  '0 @U1@ SUBM',
  '1 NAME A Submitter',
  '0 @R1@ REPO',
  '1 NAME Archive',
  '0 @N1@ NOTE A shared note',
  '1 CONT over two lines',
  '0 @S1@ SOUR',
  '1 TITL Rippikirja',
  '1 AUTH Parish',
  '1 REPO @R1@',
  '0 @I1@ INDI',
  '1 NAME Jane /Doe/',
  '2 TYPE Name at birth',
  '2 GIVN Jane',
  '2 NOTE @N1@',
  '1 NAME  /Doe/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE @#DJULIAN@ 1 JAN 1700',
  '2 PLAC Pajula',
  '3 MAP',
  '4 LATI N61.9',
  '4 LONG E27.1',
  '2 SOUR @S1@',
  '3 DATA',
  '4 TEXT Baptised',
  '3 OBJE',
  '4 FILE actes/baptism.jpg',
  '5 FORM jpg',
  '1 DEAT',
  '2 AGE 48',
  '2 CAUS fever',
  '1 RESI',
  '2 DATE BET 1867 AND 1879',
  '2 ADDR Pajula',
  '3 CITY Haukivuori',
  '1 EVEN',
  '2 TYPE Moved away',
  '1 OBJE',
  '2 FILE photos/Charlotte Brontë.jpg',
  '3 FORM jpg',
  '2 TITL Portrait',
  '2 NOTE Taken in 1900',
  '1 ASSO @I2@',
  '2 RELA Godparent',
  '1 NOTE Line one',
  '2 CONT @line two',
  '1 SOUR @S1@',
  '2 PAGE https://www.myheritage.fi/research/collection-10509/x?itemId=1',
  '2 QUAY 4',
  '2 EVEN Record',
  '3 ROLE 10509:1-:abc',
  '2 DATA',
  '3 DATE 1 JAN 1900',
  '3 TEXT Jane Doe',
  '1 SOUR Parish register, seen in person',
  '1 FAMS @F1@',
  '1 CHAN',
  '2 DATE 4 FEB 2018',
  '3 TIME 20:42:25',
  '0 @I2@ INDI',
  '1 NAME John /Doe/',
  '1 FAMS @F1@',
  '0 @I3@ INDI',
  '1 NAME Child /Doe/',
  '1 FAMC @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I1@',
  '1 CHIL @I3@',
  '1 MARR',
  '2 DATE 1890',
  '0 TRLR',
  ''
].join('\r\n');

export async function importGedcomFixture(
  registry: DatasetRegistry,
  slug: string
) {
  const gedzip = packGedzip(
    FIXTURE,
    new Map([
      ['photos/Charlotte Brontë.jpg', new Uint8Array([1, 2, 3])],
      ['actes/baptism.jpg', new Uint8Array([4, 5, 6])]
    ])
  );
  await registry.import({
    slug,
    source: { gedzip },
    sourceFilename: `${slug}.gdz`
  });
}
