// The real Reader: Claude reads one Astia Image per request and answers in a
// fixed JSON shape (structured outputs). Credentials come from the
// environment or an `ant auth login` profile, never from the repo; with only
// OPENROUTER_API_KEY set, requests go through OpenRouter's Anthropic-shaped
// endpoint instead.
//
// A refusal reads as unreadable, so one declined Image doesn't stop a run;
// so does an answer that doesn't fit its shape. Haiku has no server-side
// fallback, so its requests carry none; on the Claude API other models fall
// back on a decline to the model the API picks for it. OpenRouter takes no
// such fallback, so there a decline stays unreadable.

import Anthropic from '@anthropic-ai/sdk';

import type {
  Box,
  DatesReading,
  EntryReading,
  ImageRef,
  PagesReading,
  Person,
  Question,
  Reader,
  Register
} from '@server/citation-scans/reader';

import { pacedImage } from './images';
import type { Scan } from './images';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Changed with what a question asks, so readings made before are asked
// again: find-entry gained the birth year and the entry's box, then the
// household table, then the date written for the entry; dates gained the
// register, then dates in any register.
const VERSIONS: Partial<Record<Question, string>> = { dates: '3', entry: '4' };

export const DEFAULT_MODELS: Record<Question, string> = {
  pages: 'claude-haiku-5-5',
  dates: 'claude-haiku-5-5',
  entry: 'claude-haiku-5-5'
};

const DEFAULT_EFFORT: Record<Question, Effort> = {
  pages: 'low',
  dates: 'low',
  entry: 'high'
};

// Dollars per million input and output tokens, first-party API rates as of
// October 2026.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-fable-5-1': { input: 10, output: 50 }
};

// What a model was asked and spent, by the model that answered.
export interface Spend {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  // Null when the model's price isn't known here.
  dollars: number | null;
}

const SYSTEM = `You read scans of Finnish parish church books from the 1700s and 1800s: communion books (rippikirjat), children's books (lastenkirjat), and baptism and marriage registers. They are handwritten, in Swedish or Finnish, sometimes with Latin.

Answer only from what is written on the image you are shown. When you can't make out what you are asked for, say it is unreadable rather than guess: an unreadable answer is useful, a wrong one is not.`;

const PAGES_PROMPT = `Read the book's own page numbers written on this image, usually at the top outer corners. A book may number each spread once (one number on the image) or each page (two numbers, one per page). Give the numbers from left to right.

Leave out numbers that aren't the book's page numbering: archive stamps, film or frame numbers, rulers and colour charts, house or household numbers, and years.

If no page number is legible, answer readable: false with no pages.`;

const DATES_PROMPT = `This image is from a parish register, whose entries run in date order. One book may hold several registers one after another: baptisms, marriages, deaths and burials, moves.

Say which register the entries on this image are in: baptisms (births and baptisms), marriages (marriages or banns, often headed Copulati or Vihityt), or other (deaths and burials, often headed Döde or Kuolleet; communicants, moves, an index, a title page).

Give the earliest and the latest date of the entries on it, as YYYY-MM-DD, whatever the register: for baptisms, any birth or baptism date written for an entry; for marriages, the marriage (or banns) dates; for deaths, the death or burial dates. Give the dates of the entries actually written on this image, not the span of the year or section they belong to.

The year is often written only at the top of the page or of a section and holds for the entries below it; month names may be in Swedish, Finnish or Latin, or abbreviated.

If you can't read at least one complete date with its year, leave the dates empty: on a page of baptisms or marriages, answer readable: false; on a page of another register, answer readable: true with its register. If you can't tell the register either, answer readable: false.`;

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

// Each answer as structured output; `readable` false means unreadable.
const SCHEMAS: Record<Question, Record<string, unknown>> = {
  pages: {
    type: 'object',
    properties: {
      readable: { type: 'boolean' },
      pages: { type: 'array', items: { type: 'integer' } }
    },
    required: ['readable', 'pages'],
    additionalProperties: false
  },
  dates: {
    type: 'object',
    properties: {
      readable: { type: 'boolean' },
      earliest: { type: 'string' },
      latest: { type: 'string' },
      register: { type: 'string', enum: ['baptisms', 'marriages', 'other'] }
    },
    required: ['readable', 'earliest', 'latest', 'register'],
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

function toPages(json: { readable: boolean; pages: number[] }): PagesReading {
  // A book numbering spreads may write the number on both pages.
  const pages = [
    ...new Set(json.pages.filter((p) => Number.isInteger(p) && p > 0))
  ];
  return json.readable && pages.length > 0 ? { pages } : UNREADABLE;
}

function toDates(json: {
  readable: boolean;
  earliest: string;
  latest: string;
  register: Register;
}): DatesReading {
  const { earliest, latest, register } = json;
  if (!json.readable) return UNREADABLE;
  if (!ISO_DATE.test(earliest) || !ISO_DATE.test(latest)) {
    // Another register's page tells the search to pass it, dated or not.
    return register === 'other'
      ? { earliest: '', latest: '', register }
      : UNREADABLE;
  }
  return earliest <= latest
    ? { earliest, latest, register }
    : { earliest: latest, latest: earliest, register };
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
function toBox(json: EntryJson, scan: Scan): Box | null {
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

function mediaType(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
}

export interface ClaudeReaderOptions {
  models?: Partial<Record<Question, string>>;
  effort?: Partial<Record<Question, Effort>>;
  // The Image, scaled to send; by default fetched through the image cache,
  // paced.
  image?: (at: ImageRef) => Promise<Scan>;
  client?: Anthropic;
}

export interface ClaudeReader extends Reader {
  spend: () => Record<string, Spend>;
}

const OPENROUTER = 'https://openrouter.ai/api';

// Where requests go: the Claude API with its own credentials, or OpenRouter
// when its key is the only one there is.
function connect() {
  const env = process.env;
  const anthropic =
    env.ANTHROPIC_API_KEY !== undefined ||
    env.ANTHROPIC_AUTH_TOKEN !== undefined;
  const openRouterKey = env.OPENROUTER_API_KEY;
  if (anthropic || openRouterKey === undefined) {
    return { client: new Anthropic(), openRouter: false };
  }
  const client = new Anthropic({
    apiKey: null,
    authToken: openRouterKey,
    baseURL: OPENROUTER
  });
  return { client, openRouter: true };
}

// OpenRouter names models "anthropic/claude-sonnet-5.5".
function openRouterModel(model: string) {
  return `anthropic/${model.replace(/-(?<major>\d+)-(?<minor>\d+)$/, '-$<major>.$<minor>')}`;
}

function claudeModel(served: string) {
  return served.replace(/^anthropic\//, '').replace(/\./g, '-');
}

export function claudeReader(options: ClaudeReaderOptions = {}): ClaudeReader {
  const models = { ...DEFAULT_MODELS, ...options.models };
  const effort = { ...DEFAULT_EFFORT, ...options.effort };
  const image = options.image ?? pacedImage;
  const { client, openRouter } =
    options.client === undefined
      ? connect()
      : { client: options.client, openRouter: false };
  const spent = new Map<string, Spend>();

  function record(model: string, usage: Anthropic.Beta.BetaUsage) {
    const s = spent.get(model) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      dollars: 0
    };
    const input =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const price = PRICES[model];
    s.calls += 1;
    s.inputTokens += input;
    s.outputTokens += usage.output_tokens;
    s.dollars =
      price === undefined || s.dollars === null
        ? null
        : s.dollars +
          (input * price.input + usage.output_tokens * price.output) / 1e6;
    spent.set(model, s);
  }

  // The parsed answer, or null for a refusal or an answer out of shape, and
  // the size of the Image the model saw.
  async function ask(question: Question, at: ImageRef, prompt: string) {
    const scan = await image(at);
    const { bytes } = scan;
    const model = models[question];
    const fallback = !openRouter && !model.startsWith('claude-haiku');
    const response = await client.beta.messages.create({
      model: openRouter ? openRouterModel(model) : model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: {
        effort: effort[question],
        format: { type: 'json_schema', schema: SCHEMAS[question] }
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
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType(bytes),
                data: Buffer.from(bytes).toString('base64')
              }
            },
            { type: 'text', text: prompt }
          ]
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
      const { json } = await ask('pages', at, PAGES_PROMPT);
      return json === null
        ? UNREADABLE
        : toPages(json as Parameters<typeof toPages>[0]);
    },
    dates: async (at) => {
      const { json } = await ask('dates', at, DATES_PROMPT);
      return json === null
        ? UNREADABLE
        : toDates(json as Parameters<typeof toDates>[0]);
    },
    findEntry: async (at, person) => {
      const { json, scan } = await ask('entry', at, entryPrompt(person));
      return json === null ? UNREADABLE : toEntry(json as EntryJson, scan);
    }
  };
}
