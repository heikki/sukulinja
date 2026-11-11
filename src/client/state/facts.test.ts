import { expect, test } from 'bun:test';

import { ApiError } from '@/client/dataset-api';
import { memoryDatasetApi } from '@/client/dataset-api/memory';
import type { PersonDetails } from '@/common/types';

import { openFacts } from './facts';
import { openSelected } from './selected';

const MATTI: PersonDetails = {
  id: 1,
  name: 'Matti Esimerkki',
  sex: 'M',
  facts: [],
  marriages: [],
  citations: [],
  photos: []
};

const BLANK = { date: '', place: '', value: '', type: '' };

function opened(down = false) {
  const api = memoryDatasetApi(
    { details: { 1: MATTI }, places: ['Juva', 'Haukivuori'] },
    { down }
  );
  const selected = openSelected(api, { grace: 0 });
  let saved = 0;
  const facts = openFacts(api, selected, {
    saved: () => {
      saved += 1;
    }
  });
  return { api, selected, facts, saved: () => saved };
}

test('saves on the Selected person, then reads their details again', async () => {
  const { api, selected, facts, saved } = opened();
  await selected.select(1);
  api.asked.length = 0;
  await facts.add({ ...BLANK, tag: 'BIRT', familyId: null, date: '1761' });
  await facts.edit(7, { ...BLANK, date: '1762' });
  await facts.remove(7);
  expect(api.asked).toEqual([
    'add fact 1 BIRT: 1761',
    'person 1',
    'links 1',
    'edit fact 1 7: 1762',
    'person 1',
    'links 1',
    'delete fact 1 7',
    'person 1',
    'links 1'
  ]);
  expect(saved()).toBe(3);
});

test('a refusal is thrown, and nothing is read again', async () => {
  const { api, selected, facts, saved } = opened(true);
  void selected.select(1);
  const refused = await facts
    .add({ ...BLANK, tag: 'BIRT', familyId: null })
    .catch((err: unknown) => err);
  expect(refused).toBeInstanceOf(ApiError);
  expect(saved()).toBe(0);
  expect(api.asked.filter((a) => a.startsWith('person'))).toHaveLength(1);
});

test('suggests the dataset’s places once asked', async () => {
  const { facts } = opened();
  expect(facts.places.get()).toEqual([]);
  facts.loadPlaces();
  await Bun.sleep(0);
  expect(facts.places.get()).toEqual(['Juva', 'Haukivuori']);
});
