import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';

import { openAssistant } from './assistant';

const SPEND = {
  calls: 2,
  inputTokens: 2000,
  outputTokens: 200,
  dollars: 0.012
};

test('asks, showing what it reads and the answer as it comes', async () => {
  const api = memoryDatasetApi({
    assistant: [
      [
        { type: 'conversation', id: 'c1' },
        { type: 'reading', label: 'Finding people named Matti' },
        { type: 'text', text: 'Matti ' },
        { type: 'text', text: 'Esimerkki.' },
        { type: 'done', spend: SPEND, ended: 'answered' }
      ],
      [
        { type: 'conversation', id: 'c1' },
        { type: 'text', text: 'Taas.' },
        { type: 'done', spend: SPEND, ended: 'answered' }
      ]
    ]
  });
  const assistant = openAssistant(api);
  await assistant.ask('Kuka on Matti?', 1);
  expect(assistant.exchanges.get()).toEqual([
    {
      question: 'Kuka on Matti?',
      answer: 'Matti Esimerkki.',
      reading: ['Finding people named Matti'],
      ended: 'answered',
      failed: null
    }
  ]);
  expect(assistant.spend.get()).toEqual(SPEND);
  await assistant.ask('Taas', null);
  expect(api.asked).toEqual(['ask: Kuka on Matti?', 'ask in c1: Taas']);
  expect(assistant.busy.get()).toBe(false);
});

test('shows why a question failed', async () => {
  const api = memoryDatasetApi({
    assistant: [
      [
        { type: 'conversation', id: 'c1' },
        { type: 'error', message: 'No key.' }
      ]
    ]
  });
  const assistant = openAssistant(api);
  await assistant.ask('Hei', null);
  expect(assistant.exchanges.get()[0]!.failed).toBe('No key.');
});

test('says the app could not be reached', async () => {
  const assistant = openAssistant(memoryDatasetApi({}, { down: true }));
  await assistant.ask('Hei', null);
  expect(assistant.exchanges.get()[0]!.failed).toBe(
    'The app is not responding.'
  );
});

test('a new conversation forgets the old one', async () => {
  const api = memoryDatasetApi({
    assistant: [[{ type: 'conversation', id: 'c1' }]]
  });
  const assistant = openAssistant(api);
  await assistant.ask('Hei', null);
  await assistant.restart();
  expect(assistant.exchanges.get()).toEqual([]);
  expect(api.asked).toEqual(['ask: Hei', 'forget c1']);
});
