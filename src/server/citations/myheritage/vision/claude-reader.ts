// The real Reader: Claude reads one Astia Image per request and answers in a
// fixed JSON shape (structured outputs). The client and its credentials
// are the app's (`@/server/claude/client`).
//
// A refusal reads as unreadable, so one declined Image doesn't stop a run;
// so does an answer that doesn't fit its shape. Haiku has no server-side
// fallback, so its requests carry none; on the Claude API other models fall
// back on a decline to the model the API picks for it. OpenRouter takes no
// such fallback, so there a decline stays unreadable.

import type Anthropic from '@anthropic-ai/sdk';

import {
  addSpend,
  claudeModel,
  connect,
  NO_SPEND,
  openRouterModel
} from '../../../claude/client';
import type { Spend } from '../../../claude/client';
import type { ImageRef } from '../../astia/astia';
import type { Region, Scan } from './images';
import type {
  EntryReading,
  Fractions,
  PagesReading,
  Person,
  Question,
  Reader
} from './reader';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Changed with what a question asks, so readings made before are asked
// again: find-entry gained the birth year and the entry's box, then the
// household table, then the date written for the entry.
const VERSIONS: Partial<Record<Question, string>> = {
  pages: '8',
  entry: '4'
};

const DEFAULT_MODELS: Record<Question, string> = {
  pages: 'claude-haiku-5-5',
  entry: 'claude-haiku-5-5'
};

const DEFAULT_EFFORT: Record<Question, Effort> = {
  pages: 'low',
  entry: 'high'
};

export type { Spend } from '../../../claude/client';

const SYSTEM = `You read scans of Finnish parish church books from the 1700s and 1800s: communion books (rippikirjat), children's books (lastenkirjat), and baptism and marriage registers. They are handwritten, in Swedish or Finnish, sometimes with Latin.

Answer only from what is written on the image you are shown. When you can't make out what you are asked for, say it is unreadable rather than guess: an unreadable answer is useful, a wrong one is not.`;

// A spread's page number is at its top left: a book numbering spreads
// writes it there, and one numbering pages its left page's, the right
// page's following it (the survey tells the two apart by their pace). That
// corner alone is sent, enlarged, tight enough to leave out a printed
// form's entry numbers and column headings, which drew the model off the
// handwritten number; read digit by digit, fewer digits are lost.
const PAGE_CORNER: Region = { left: 0, top: 0, width: 0.2, height: 0.12 };
// Where there is none in that corner, the top of the left page is asked:
// some books write it there in the middle, as "Pagina 12".
const PAGE_TOP: Region = { left: 0, top: 0, width: 0.5, height: 0.15 };

const PAGES_PROMPT = `This is the top left corner of a spread in a church book. Its page number is handwritten in ink at the very top left: a large number, often with a flourish under or through it. Ignore printed numbers, column headings and entry numbers. Read the page number one digit at a time, from left to right, counting every digit, then give the whole number. If there is none, answer readable: false.`;

const PAGE_TOP_PROMPT = `This is the top of the left page of a spread in a church book. Its page number is handwritten in ink at the top, at the left or in the middle, sometimes after a word such as Pagina. Ignore printed numbers, column headings and entry numbers. Read the page number one digit at a time, from left to right, counting every digit, then give the whole number. If there is none, answer readable: false.`;

function householdLines(person: Person) {
  const h = person.household ?? null;
  if (h === null) return [];
  return [
    h.born === null ? null : `Born: ${h.born}`,
    h.relation === null
      ? null
      : `Relation to the household head: ${h.relation}`,
    h.with === null ? null : `Listed in the household of, or with: ${h.with}`
  ];
}

// The household as the record lists it, the person marked: the household
// is found by its head and members, and the person by their place in it.
// Nothing where the person is listed alone.
export function householdTable(person: Person) {
  const members = person.household?.members ?? [];
  if (members.length < 2) return '';
  const rows = members.map((m) => {
    const born = m.born === null ? '' : `, born ${m.born}`;
    const self = m.name === person.name ? '  ← this person' : '';
    return `- ${m.relation ?? '?'}: ${m.name}${born}${self}`;
  });
  return `
The household as the record lists it, in the book's order:
${rows.join('\n')}
Look for this household on the image, and for this person in it.
`;
}

const RELATIONS = {
  child: 'Child',
  father: 'Father',
  mother: 'Mother',
  spouse: 'Spouse'
};

// The others an index entry names, and that the person cited may be any of
// them: on a parent's citation of a baptism, the child's entry is the one
// to find. Nothing for a person asked about alone.
export function entryNames(person: Person) {
  const named = person.named ?? [];
  if (named.length === 0) return '';
  const rows = named.map((n) => `- ${RELATIONS[n.relation]}: ${n.name}`);
  return `
The register entry names:
${rows.join('\n')}
This person may be the child or a parent in the entry, or one of the couple. Look for the entry by all of these names, and answer found if the entry is on this image and this person is named in it. A child is often written by first name alone, the surname only on the father's or mother's line. Entries are now and then written out of date order, added later.
`;
}

function entryPrompt(person: Person) {
  const known = [
    `Name: ${person.name}`,
    (person.date ?? null) === null ? null : `Date of the event: ${person.date}`,
    (person.village ?? null) === null ? null : `Village: ${person.village}`,
    ...householdLines(person)
  ].filter((line) => line !== null);
  return `Is this person written on this image?

${known.join('\n')}
${householdTable(person)}${entryNames(person)}
The name may be written differently from how it is given here, and still be the same person:
- Swedish and Finnish forms of a name: Johan for Juho, Henrik for Heikki, Matts for Matti, Maria for Maija, Carl for Kalle, Gustaf for Kustaa.
- A patronymic instead of, or as well as, a surname: Johansson, Johansdotter, Juhonpoika, Juhontytär.
- A farm or house name standing for the surname, or no surname at all.
- Old spellings: W for V, e for ä, doubled or single letters, abbreviations, Latin forms.

The surname, patronymic or farm name must still be the same name: Korhoin, Korhoinen and Korhonen are one name written differently, but Korhoin and Orain are two different names. A matching first name with a surname that only looks similar is not the person; nor is a common first name (Maria, Margareta, Johan) with no surname to go by, unless the household or birth date given below matches too.

Communion and children's books list people by household: the head first, then the wife, children and others, each with a birth date. A person given by first name alone is someone in such a household: look for the household named above, and answer found only if this person is listed in it, with a matching birth date where one is written. The relation is in Finnish (Perheenpää head, Vaimo wife, Poika son, Tytär daughter, Veli brother, Sisar sister, Vävy son-in-law, Miniä daughter-in-law).

The person's entry may continue from or onto another image; answer found if the person's own name is on this one. Don't confirm on a first name alone, or on a similar name that belongs to someone else: answer found only when you can read the person's name on the image, and give how sure you are as a confidence from 0 to 1.

If you find the person, also give:
- born_year: the birth year written beside them in the book, as four digits; 0 if none is written. Read it from the scan, not from what's given above.
- event_date: in a baptism or marriage register, the baptism (or marriage) date written for their entry, as YYYY-MM-DD, its year from the page or section heading where it's written only there; empty in other books, or if none is written. Read it from the scan, not from what's given above.
- box: the rectangle around their entry (their name and the rest of their line) in pixels of this image, x and y its top-left corner. All zeros if not found.

If the writing is too faint or damaged to tell, answer readable: false.`;
}

// One of several people asked about at once: what's known of them, as
// find-entry gives it, under their number.
function personBlock(person: Person, n: number) {
  const known = [
    `Name: ${person.name}`,
    (person.date ?? null) === null ? null : `Date of the event: ${person.date}`,
    (person.village ?? null) === null ? null : `Village: ${person.village}`,
    ...householdLines(person)
  ].filter((line) => line !== null);
  return `## Person ${n}
${known.join('\n')}
${householdTable(person)}${entryNames(person)}`;
}

// Every person at once: the find-entry question, asked of each.
export function entriesPrompt(people: Person[]) {
  const asked = entryPrompt({ name: '…' })
    .split('\n')
    .filter((line) => !line.startsWith('Name: '))
    .join('\n')
    .replace('Is this person written on this image?', '');
  return `Which of these people are written on this image? Answer for each of them, by their number, as you would for one.

${people.map((p, i) => personBlock(p, i + 1)).join('\n')}
For each person:
${asked.trim()}

Give each person's answer under their number. The readable at the top is for the whole image: false only if none of it can be read.`;
}

// Each answer as structured output; `readable` false means unreadable.
const SCHEMAS: Record<Question, Record<string, unknown>> = {
  pages: {
    type: 'object',
    properties: {
      readable: { type: 'boolean' },
      digits: { type: 'array', items: { type: 'integer' } },
      number: { type: 'integer' }
    },
    required: ['readable', 'digits', 'number'],
    additionalProperties: false
  },
  entry: {
    type: 'object',
    properties: {
      readable: { type: 'boolean' },
      found: { type: 'boolean' },
      confidence: { type: 'number' },
      born_year: { type: 'integer' },
      event_date: { type: 'string' },
      box: {
        type: 'object',
        properties: {
          x: { type: 'integer' },
          y: { type: 'integer' },
          width: { type: 'integer' },
          height: { type: 'integer' }
        },
        required: ['x', 'y', 'width', 'height'],
        additionalProperties: false
      }
    },
    required: [
      'readable',
      'found',
      'confidence',
      'born_year',
      'event_date',
      'box'
    ],
    additionalProperties: false
  }
};

// Every person's find-entry answer, by number.
const ENTRIES_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          person: { type: 'integer' },
          ...(SCHEMAS.entry.properties as Record<string, unknown>)
        },
        required: ['person', ...(SCHEMAS.entry.required as string[])],
        additionalProperties: false
      }
    }
  },
  required: ['readable', 'people'],
  additionalProperties: false
};

const UNREADABLE = { unreadable: true } as const;

// The answer a response carries, or null for a refusal or one out of shape.
function parsed(response: Anthropic.Beta.BetaMessage): unknown {
  if (response.stop_reason !== 'end_turn') return null;
  const text = response.content.find((b) => b.type === 'text')?.text;
  try {
    return text === undefined ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The page number read in the top left corner; its digits, read one by
// one before it, are the model's working.
export function toPages(
  json: { readable: boolean; digits: number[]; number: number } | null
): PagesReading {
  if (json?.readable !== true) return UNREADABLE;
  const { number } = json;
  return Number.isInteger(number) && number > 0
    ? { pages: [number] }
    : UNREADABLE;
}

interface EntryJson {
  readable: boolean;
  found: boolean;
  confidence: number;
  born_year: number;
  event_date: string;
  box: { x: number; y: number; width: number; height: number };
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

// The entry's box in pixels of the scan as sent, as fractions of it; none
// where it's empty or the person wasn't found.
function toBox(json: EntryJson, scan: Scan): Fractions | null {
  const { x, y, width, height } = json.box;
  if (!json.found || width <= 0 || height <= 0) return null;
  return {
    left: clamp01(x / scan.width),
    top: clamp01(y / scan.height),
    width: clamp01(width / scan.width),
    height: clamp01(height / scan.height)
  };
}

function toEntry(json: EntryJson, scan: Scan): EntryReading {
  if (!json.readable) return UNREADABLE;
  const year = json.born_year;
  return {
    found: json.found,
    confidence: clamp01(json.confidence),
    bornYear: json.found && year >= 1500 && year < 2000 ? year : null,
    date: json.found && ISO_DATE.test(json.event_date) ? json.event_date : null,
    box: toBox(json, scan)
  };
}

interface EntriesJson {
  readable: boolean;
  people: Array<EntryJson & { person: number }>;
}

// Each person's answer in their order; one left out wasn't found, and the
// whole Image unreadable leaves each unreadable.
export function toEntries(
  json: EntriesJson | null,
  of: number,
  scan: Scan
): EntryReading[] {
  const people = Array.from({ length: of }, (): EntryReading => UNREADABLE);
  if (json?.readable !== true) return people;
  people.fill({ found: false, confidence: 0, box: null });
  for (const answer of json.people) {
    const i = answer.person - 1;
    if (i >= 0 && i < of) people[i] = toEntry(answer, scan);
  }
  return people;
}

function mediaType(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
}

interface ClaudeReaderOptions {
  models?: Partial<Record<Question, string>>;
  // The key to ask with; by default the environment's credentials.
  apiKey?: string | null;
  effort?: Partial<Record<Question, Effort>>;
  // The Image, scaled to send: pacedImages(cache), through the Scan
  // cache.
  image: (at: ImageRef, region?: Region | null) => Promise<Scan>;
  client?: Anthropic;
}

export interface ClaudeReader extends Reader {
  spend: () => Record<string, Spend>;
}

export function claudeReader(options: ClaudeReaderOptions): ClaudeReader {
  const models = { ...DEFAULT_MODELS, ...options.models };
  const effort = { ...DEFAULT_EFFORT, ...options.effort };
  const image = options.image;
  const { client, openRouter } =
    options.client === undefined
      ? connect(options.apiKey ?? null)
      : { client: options.client, openRouter: false };
  const spent = new Map<string, Spend>();

  function record(model: string, usage: Anthropic.Beta.BetaUsage) {
    spent.set(model, addSpend(spent.get(model) ?? NO_SPEND, model, usage));
  }

  // The parsed answer, or null for a refusal or an answer out of shape, and
  // the size of the Image the model saw: the whole Image, or the `regions`
  // of it, in turn.
  async function ask(
    question: Question,
    at: ImageRef,
    prompt: string,
    {
      schema = SCHEMAS[question],
      regions = [null] as Array<Region | null>
    } = {}
  ) {
    const scans = [];
    for (const region of regions) {
      // eslint-disable-next-line no-await-in-loop -- the Images come one at a time
      scans.push(await image(at, region));
    }
    const scan = scans[0]!;
    const images: Anthropic.Beta.BetaContentBlockParam[] = scans.map(
      ({ bytes }) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType(bytes),
          data: Buffer.from(bytes).toString('base64')
        }
      })
    );
    const model = models[question];
    const fallback = !openRouter && !model.startsWith('claude-haiku');
    const response = await client.beta.messages.create({
      model: openRouter ? openRouterModel(model) : model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: {
        effort: effort[question],
        format: { type: 'json_schema', schema }
      },
      ...(fallback
        ? {
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default' as const
          }
        : {}),
      messages: [
        {
          role: 'user',
          content: [...images, { type: 'text', text: prompt }]
        }
      ]
    });
    record(claudeModel(response.model), response.usage);
    return { json: parsed(response), scan };
  }

  return {
    models,
    versions: VERSIONS,
    spend: () => Object.fromEntries(spent),
    pageNumbers: async (at) => {
      const corner = await ask('pages', at, PAGES_PROMPT, {
        regions: [PAGE_CORNER]
      });
      const read = toPages(corner.json as Parameters<typeof toPages>[0]);
      if (!('unreadable' in read)) return read;
      const top = await ask('pages', at, PAGE_TOP_PROMPT, {
        regions: [PAGE_TOP]
      });
      return toPages(top.json as Parameters<typeof toPages>[0]);
    },
    findEntry: async (at, person) => {
      const { json, scan } = await ask('entry', at, entryPrompt(person));
      return json === null ? UNREADABLE : toEntry(json as EntryJson, scan);
    },
    findEntries: async (at, people) => {
      const asked = await ask('entry', at, entriesPrompt(people), {
        schema: ENTRIES_SCHEMA
      });
      return toEntries(
        asked.json as EntriesJson | null,
        people.length,
        asked.scan
      );
    }
  };
}
