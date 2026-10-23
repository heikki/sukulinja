import { expect, test } from 'bun:test';

import { memoryDatasetApi } from '@/client/dataset-api/memory';
import { openAppState } from '@/client/state';
import type {
  CitationRow,
  Link,
  PersonRow,
  VolumeCitation
} from '@/common/types';

import { reminderPlaces, remindersHere } from './reminder-places';

function churchBook(id: number): CitationRow {
  return {
    id,
    source: null,
    reference: null,
    entry: null,
    page: null,
    url: null,
    record: null,
    text: null,
    churchBook: true,
    madeInApp: false,
    markKey: `citation ${id}`,
    citedPage: null,
    cited: null
  };
}

function person(id: number, given: string, born: number): PersonRow {
  return {
    id,
    given,
    surname: 'Esimerkki',
    sex: 'U',
    birth_year: born,
    death_year: null,
    birth_date: null,
    death_date: null,
    died: false,
    photo_path: null,
    crop: null
  };
}

const AT_18: Link = {
  volumeId: '201',
  volume: 'I Aa:201',
  url: '',
  precision: 'entry',
  image: 18,
  box: { left: 100, top: 200, width: 500, height: 50 },
  certainty: 'marked'
};

// On Image 18: Matti's 11 and 13, and Maija's 12. Matti's 14 is on 19.
const ROWS: VolumeCitation[] = [
  { personId: 1, citation: churchBook(11), link: AT_18 },
  {
    personId: 2,
    citation: churchBook(12),
    link: { ...AT_18, box: { ...AT_18.box, top: 400 } }
  },
  {
    personId: 1,
    citation: churchBook(13),
    link: { ...AT_18, box: { ...AT_18.box, top: 600 } }
  },
  { personId: 1, citation: churchBook(14), link: { ...AT_18, image: 19 } }
];

async function viewing() {
  const api = memoryDatasetApi({
    persons: [person(1, 'Matti', 1770), person(2, 'Maija', 1772)],
    volumes: { '201': { images: 40, citations: ROWS } },
    reminders: [
      {
        id: 1,
        text: 'On the Image',
        on: {
          kind: 'image',
          volumeId: '201',
          volume: 'I Aa:201',
          image: 18,
          fileId: '201-f18',
          stale: false
        },
        created: '',
        done: null
      },
      {
        id: 2,
        text: "On Matti's 14",
        on: {
          kind: 'citation',
          personId: 1,
          citationId: 14,
          source: null,
          reference: null
        },
        created: '',
        done: null
      },
      {
        id: 3,
        text: "On Maija's 12",
        on: {
          kind: 'citation',
          personId: 2,
          citationId: 12,
          source: null,
          reference: null
        },
        created: '',
        done: null
      }
    ]
  });
  const state = openAppState(api);
  await state.chart.load(() => ({ rootId: 1, selectedId: 1, panned: false }));
  state.reminders.load();
  await Bun.sleep(0);
  state.viewer.open({ citation: churchBook(11), link: AT_18 });
  await Bun.sleep(0);
  return state;
}

const IMAGE_18 = {
  volumeId: '201',
  volume: 'I Aa:201',
  image: 18,
  fileId: '201-f18'
};

test("on the source's Image, a Reminder is on its Citation, or else the Image", async () => {
  const state = await viewing();
  const places = reminderPlaces(state);
  expect(places?.cited).toEqual({
    header: ['Matti Esimerkki', 'I Aa:201 · Image 18'],
    target: { citationId: 11 }
  });
  expect(places?.image).toEqual({
    header: ['I Aa:201 · Image 18'],
    target: IMAGE_18
  });
});

test("off the source's Image, a Reminder is on the Image shown", async () => {
  const state = await viewing();
  state.viewer.show(19);
  await Bun.sleep(0);
  expect(reminderPlaces(state)).toEqual({
    cited: null,
    image: {
      header: ['I Aa:201 · Image 19'],
      target: { ...IMAGE_18, image: 19, fileId: '201-f19' }
    }
  });
});

test("the Reminders here are the Image's and those of the Citations linking it", async () => {
  const state = await viewing();
  expect(remindersHere(state).map((r) => r.id)).toEqual([1, 3]);
  state.viewer.show(19);
  expect(remindersHere(state).map((r) => r.id)).toEqual([2]);
});
