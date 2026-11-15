// The assistant's Proposal, over the app's own server: what Claude
// proposes is listed and written only when applied, through the app's own
// operations, each Change saying it was made via the assistant; an item
// the app refuses says why, and the rest go on.

import { afterEach, beforeEach, expect, test } from 'bun:test';

import type Anthropic from '@anthropic-ai/sdk';

import type { DatasetApi } from '@/client/dataset-api';
import { servedDataset } from '@/client/dataset-api/served';
import type { Model, ModelAnswer } from '@/server/assistant/model';
import { memoryAstia } from '@/server/citations/testing';

import { openAssistant } from './assistant';

// Made-up people: Matti (1, 1801–1860), who lived in Kylä in 1840 and has
// a source for it not yet linked to it.
const GEDCOM = [
  '0 @I1@ INDI',
  '1 NAME Mati /Esimerkki/',
  '1 BIRT',
  '2 DATE 1801',
  '1 DEAT',
  '2 DATE 1860',
  '1 RESI',
  '2 DATE 1840',
  '2 PLAC Kylä, Pitäjä, Suomi',
  '1 SOUR @S1@',
  '2 PAGE s. 12',
  '0 @S1@ SOUR',
  '1 TITL Esimerkin rippikirja 1838–1844',
  ''
].join('\n');

const USAGE = JSON.parse(
  '{"input_tokens":1000,"output_tokens":100}'
) as Anthropic.Beta.BetaUsage;

function answer(content: unknown[], stopReason: ModelAnswer['stopReason']) {
  return {
    content: content as Anthropic.Beta.BetaContentBlock[],
    stopReason,
    usage: USAGE,
    model: 'claude-opus-5-5'
  };
}

// Claude, answering in turn; what it's given each time is kept.
const script: ModelAnswer[] = [];
const given: string[] = [];
async function model(...[request]: Parameters<Model>) {
  given.push(JSON.stringify(request.messages.at(-1)));
  return await Promise.resolve(script.shift()!);
}

function call(id: string, name: string, input: Record<string, unknown>) {
  return { type: 'tool_use', id, name, input };
}

let served: Awaited<ReturnType<typeof servedDataset>> | null = null;
let api: DatasetApi | null = null;

beforeEach(async () => {
  script.length = 0;
  given.length = 0;
  served = await servedDataset(GEDCOM, memoryAstia({}), { assistant: model });
  ({ api } = served);
});

afterEach(async () => {
  await served?.close();
});

test('proposes, then writes only what is ticked and applied', async () => {
  const before = await api!.person(1);
  const residence = before.facts.find((f) => f.tag === 'RESI')!;
  const source = before.citations[0]!;
  script.push(
    answer(
      [
        call('t1', 'support_fact', {
          personId: 1,
          citationId: source.id,
          factId: residence.id,
          supports: true,
          reason: 'Rippikirja 1838–1844 näyttää hänet Kylässä.'
        }),
        call('t2', 'rename_person', {
          personId: 1,
          given: 'Matti',
          surname: 'Esimerkki',
          reason: 'Kirjoitusvirhe.'
        }),
        call('t3', 'edit_fact', {
          personId: 1,
          factId: 999,
          date: '1841',
          place: null,
          address: null,
          value: null,
          type: null,
          reason: 'Ei ole.'
        }),
        call('t4', 'remind', {
          personId: 1,
          text: 'Tarkista kuolinpäivä.',
          reason: 'Pyysit.'
        })
      ],
      'tool_use'
    ),
    answer([{ type: 'text', text: 'Ehdotin kolmea.' }], 'end_turn')
  );
  const assistant = openAssistant(api!);
  await assistant.ask('Yhdistä lähteet ja korjaa nimi.', {
    personId: 1,
    onChart: []
  });

  // The one naming no Fact of his isn't proposed; Claude is told why.
  expect(assistant.proposal.get().map((p) => [p.id, p.label])).toEqual([
    [
      1,
      "Esimerkin rippikirja 1838–1844 supports Mati Esimerkki's Residence 1840"
    ],
    [2, 'Rename Mati Esimerkki as Matti Esimerkki'],
    [3, 'Remind on Mati Esimerkki: Tarkista kuolinpäivä.']
  ]);
  expect(given[1]).toContain('They have no such fact.');
  // Nothing is written yet.
  expect((await api!.person(1)).name).toBe('Mati Esimerkki');
  expect(await api!.changes()).toEqual([]);

  assistant.tick(3, false);
  await assistant.apply();
  expect(assistant.proposal.get().map((p) => p.state)).toEqual([
    'applied',
    'applied',
    'open'
  ]);
  const after = await api!.person(1);
  expect(after.name).toBe('Matti Esimerkki');
  expect(after.citations[0]!.supports).toEqual([residence.id]);
  expect(await api!.reminders()).toEqual([]);
  const changes = await api!.changes();
  expect(changes.map((c) => [c.what.kind, c.via])).toEqual([
    ['person', 'assistant'],
    ['support', 'assistant']
  ]);

  // Claude hears what was applied with the next question.
  script.push(answer([{ type: 'text', text: 'Hyvä.' }], 'end_turn'));
  await assistant.ask('Kiitos', { personId: 1, onChart: [] });
  expect(given[2]).toContain('#1 applied; #2 applied');
});

test('an item the app refuses says why, and the rest are applied', async () => {
  script.push(
    answer(
      [
        call('t1', 'add_fact', {
          personId: 1,
          tag: 'BIRT',
          familyId: null,
          date: 'joskus',
          place: '',
          address: '',
          value: '',
          type: '',
          citationIds: [],
          reason: 'Kokeilu.'
        }),
        call('t2', 'add_fact', {
          personId: 1,
          tag: 'OCCU',
          familyId: null,
          date: '1840',
          place: '',
          address: '',
          value: 'Torppari',
          type: '',
          citationIds: [],
          reason: 'Rippikirja sanoo.'
        })
      ],
      'tool_use'
    ),
    answer([{ type: 'text', text: 'Ehdotin.' }], 'end_turn')
  );
  const assistant = openAssistant(api!);
  await assistant.ask('Lisää ammatti.', { personId: 1, onChart: [] });
  await assistant.apply();
  const [first, second] = assistant.proposal.get();
  expect((first!.state as { refused: string }).refused).toContain(
    'Write the date like this'
  );
  expect(second!.state).toBe('applied');
  const facts = (await api!.person(1)).facts.map((f) => [f.tag, f.value]);
  expect(facts).toContainEqual(['OCCU', 'Torppari']);
});

test('an item taken back is not applied', async () => {
  script.push(
    answer(
      [
        call('t1', 'remind', {
          personId: 1,
          text: 'Katso rippikirja.',
          reason: 'Pyysit.'
        })
      ],
      'tool_use'
    ),
    answer([call('t2', 'withdraw_proposal_item', { item: 1 })], 'tool_use'),
    answer([{ type: 'text', text: 'Otin pois.' }], 'end_turn')
  );
  const assistant = openAssistant(api!);
  await assistant.ask('Muistuta.', { personId: 1, onChart: [] });
  expect(assistant.proposal.get()[0]).toMatchObject({
    state: 'withdrawn',
    ticked: false
  });
  await assistant.apply();
  expect(await api!.reminders()).toEqual([]);
});

test('a batch adds residences, each supported by its source', async () => {
  const [source] = (await api!.person(1)).citations;
  function residence(date: string) {
    return {
      personId: 1,
      tag: 'RESI',
      familyId: null,
      date,
      place: 'Kylä, Pitäjä, Suomi',
      address: '',
      value: '',
      type: '',
      citationIds: [source!.id]
    };
  }
  script.push(
    answer(
      [
        call('t1', 'add_fact_many', {
          changes: [residence('1838'), residence('1844')],
          reason: 'Rippikirja.'
        })
      ],
      'tool_use'
    ),
    answer([{ type: 'text', text: 'Ehdotin.' }], 'end_turn')
  );
  const assistant = openAssistant(api!);
  await assistant.ask('Lisää asuinpaikat.', { personId: 1, onChart: [] });
  const [item] = assistant.proposal.get();
  expect(item!.label).toBe('Add 2 facts');
  expect(item!.examples[0]).toEndWith(
    'Residence 1838 · Kylä, Pitäjä, Suomi, supported by Esimerkin rippikirja 1838–1844'
  );
  await assistant.apply();
  expect(assistant.proposal.get()[0]!.state).toBe('applied');
  const after = await api!.person(1);
  const added = after.facts.filter(
    (f) => f.date === '1838' || f.date === '1844'
  );
  expect(added).toHaveLength(2);
  const supports = after.citations.find((c) => c.id === source!.id)!.supports;
  for (const f of added) expect(supports).toContain(f.id);
});
