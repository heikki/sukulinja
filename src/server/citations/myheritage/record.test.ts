import { describe, expect, test } from 'bun:test';

import { isoDate, parseChurchBookRef, readRecord } from './record';

const URL =
  'https://www.myheritage.fi/research/collection-10509/x?itemId=1&action=showRecord';

// The shapes MyHeritage writes, with made-up people. Plain: fields glued to
// the value before them, a raw line break inside, household rows run
// together.
const PLAIN = [
  'Matti EsimerkkiSyntymäpäivä: 1757Asuinpaikka: päivämäärien 1794 ja 1808 välissä - No. 3, Kylämaa, Pitäjä, Lääni, FinlandKirja: ',
  'Maa:FinlandKirja:Rippikirja, 1794 - 1808',
  'Piirikunta:LääniMaatila:No. 3',
  'Hallintoalue:PitäjäSivu:139',
  'Kylä:Kylämaasäilytyspaikka:Maakunta-arkisto',
  'Katso talouden jäseniä<a id="household"></a>TalousSuhde perheenpäähän; Nimi; SyntymäPerheenpää; Matti Esimerkki; 1757Vaimo; Liisa Malli; Touko 1760Tytär; Anna; 22. Heinä 1784'
].join('\n');

// HTML: rows broken with <br>, a suggestions column, entities escaped twice.
const HTML = [
  'Anna Malli&amp;lt;br&amp;gt;Syntymäpäivä: 13. Maalis 1798&amp;lt;br&amp;gt;',
  'Kirja: Lastenkirja, 1799 - 1822&amp;lt;br&amp;gt;',
  'Suhde perheenpäähän; Nimi; Syntymä; Ehdotetut vaihtoehdot&amp;lt;br&amp;gt;',
  'Perheenpää; &amp;lt;a href="x"&amp;gt;Anna Malli&amp;lt;/a&amp;gt;; 13. Maalis 1798; &amp;lt;br&amp;gt;',
  'Poika; &amp;lt;a href="y"&amp;gt;Juho&amp;lt;/a&amp;gt;; ; '
].join('');

describe('readRecord', () => {
  test('reads a plain record into name, fields and household', () => {
    expect(readRecord(PLAIN)).toEqual({
      name: 'Matti Esimerkki',
      fields: [
        { label: 'Syntymäpäivä', value: '1757' },
        {
          label: 'Asuinpaikka',
          value:
            'päivämäärien 1794 ja 1808 välissä - No. 3, Kylämaa, Pitäjä, Lääni, Finland'
        },
        { label: 'Kirja', value: 'Rippikirja, 1794 - 1808' },
        { label: 'Maatila', value: 'No. 3' },
        { label: 'Hallintoalue', value: 'Pitäjä' },
        { label: 'Sivu', value: '139' },
        { label: 'Kylä', value: 'Kylämaa' }
      ],
      household: [
        { relation: 'Perheenpää', name: 'Matti Esimerkki', born: '1757' },
        { relation: 'Vaimo', name: 'Liisa Malli', born: 'Touko 1760' },
        { relation: 'Tytär', name: 'Anna', born: '22. Heinä 1784' }
      ]
    });
  });

  test('reads an HTML record with a suggestions column', () => {
    expect(readRecord(HTML)).toEqual({
      name: 'Anna Malli',
      fields: [
        { label: 'Syntymäpäivä', value: '13. Maalis 1798' },
        { label: 'Kirja', value: 'Lastenkirja, 1799 - 1822' }
      ],
      household: [
        { relation: 'Perheenpää', name: 'Anna Malli', born: '13. Maalis 1798' },
        { relation: 'Poika', name: 'Juho', born: null }
      ]
    });
  });

  test('splits a book block that lost its colons', () => {
    const glued =
      'Matti EsimerkkiKirja: MaaFinlandKirjaRippikirja, 1770 - 1775 PiirikuntaLääniMaatilaNo. 8 HallintoaluePitäjäSivu18 KyläKylämaasäilytyspaikkaMaakunta-arkisto';
    expect(readRecord(glued).fields).toEqual([
      { label: 'Kirja', value: 'Rippikirja, 1770 - 1775' },
      { label: 'Maatila', value: 'No. 8' },
      { label: 'Hallintoalue', value: 'Pitäjä' },
      { label: 'Sivu', value: '18' },
      { label: 'Kylä', value: 'Kylämaa' }
    ]);
  });
});

describe('parseChurchBookRef', () => {
  test('reads the cited book, years, page and places', () => {
    expect(parseChurchBookRef(URL, PLAIN)).toEqual({
      url: URL,
      collection: '10509',
      parish: 'Pitäjä',
      kind: 'rippi',
      years: { from: 1794, to: 1808 },
      page: 139,
      places: ['Kylämaa', 'No. 3', 'No. 3', 'Kylämaa'],
      recordId: 1,
      name: 'Matti Esimerkki',
      date: null,
      household: {
        born: '1757',
        relation: 'Perheenpää',
        with: 'Liisa Malli',
        members: [
          { relation: 'Perheenpää', name: 'Matti Esimerkki', born: '1757' },
          { relation: 'Vaimo', name: 'Liisa Malli', born: 'Touko 1760' },
          { relation: 'Tytär', name: 'Anna', born: '22. Heinä 1784' }
        ]
      },
      named: []
    });
  });

  test('places a principal named by first name alone in their household', () => {
    const daughter = PLAIN.replace(/^Matti Esimerkki/, 'Anna');
    expect(parseChurchBookRef(URL, daughter)).toMatchObject({
      name: 'Anna',
      household: {
        born: '22. Heinä 1784',
        relation: 'Tytär',
        with: 'Matti Esimerkki'
      }
    });
  });

  test("knows a principal's birth date from the record without a table", () => {
    const alone = PLAIN.replace(/\nKatso talouden jäseniä.*$/s, '');
    expect(parseChurchBookRef(URL, alone).household).toEqual({
      born: '1757',
      relation: null,
      with: null,
      members: []
    });
    const undated = PLAIN.replace('Matti Esimerkki; 1757', 'Matti Esimerkki; ');
    expect(parseChurchBookRef(URL, undated).household).toMatchObject({
      born: '1757',
      relation: 'Perheenpää'
    });
    const unborn = alone.replace('Syntymäpäivä: 1757', '');
    expect(parseChurchBookRef(URL, unborn).household).toBeNull();
  });

  test('reads the principal of an HTML record', () => {
    expect(parseChurchBookRef(URL, HTML).name).toBe('Anna Malli');
  });

  test('reads an index entry: its event, the person and the full date', () => {
    const baptism = [
      'Juho Esimerkki',
      'Sukupuoli: Mies',
      'Ristiäiset: 29. Marras 1829 - Pitäjä, Lääni, Finland',
      'Syntymä: 21. Marras 1829',
      'Isä: Matti Esimerkki',
      'Äiti: Liisa Malli'
    ].join('\n');
    const url =
      'https://www.myheritage.fi/research/collection-30233/x?itemId=7';
    expect(parseChurchBookRef(url, baptism)).toEqual({
      url,
      collection: '30233',
      parish: 'Pitäjä',
      kind: 'kastetut',
      years: { from: 1829, to: 1829 },
      page: null,
      places: [],
      recordId: null,
      name: 'Juho Esimerkki',
      date: '1829-11-29',
      household: null,
      named: [
        { relation: 'father', name: 'Matti Esimerkki' },
        { relation: 'mother', name: 'Liisa Malli' }
      ]
    });
  });

  test('reads a marriage entry glued together in HTML', () => {
    const marriage =
      'Matti Esimerkki ja Liisa Malli&lt;br&gt;Avioliitto: 3. Heinäkuu 1845 - Pitäjä, Finland&lt;br&gt;Puoliso: Liisa Malli';
    const ref = parseChurchBookRef(
      'https://www.myheritage.fi/research/collection-30200/x?itemId=8',
      marriage
    );
    expect(ref).toMatchObject({
      kind: 'vihityt',
      name: 'Matti Esimerkki ja Liisa Malli',
      date: '1845-07-03'
    });
  });
});

describe('isoDate', () => {
  test('reads a date to the precision written', () => {
    expect(isoDate('29. Marras 1829')).toBe('1829-11-29');
    expect(isoDate('1. Tammi 1801')).toBe('1801-01-01');
    expect(isoDate('Joulu 1799')).toBe('1799-12');
    expect(isoDate('noin 1799')).toBe('1799');
    expect(isoDate('tuntematon')).toBeNull();
  });
});
