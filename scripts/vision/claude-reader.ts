// The real Reader: Claude reads one Astia Image per request and answers in a
// fixed JSON shape (structured outputs). Credentials come from the
// environment or an `ant auth login` profile, never from the repo.
//
// A refusal reads as unreadable, so one declined Image doesn't stop a run;
// so does an answer that doesn't fit its shape. Haiku has no server-side
// fallback, so its requests carry none; other models fall back on a decline
// to the model the API picks for it.

import Anthropic from '@anthropic-ai/sdk';

import type {
  DatesReading,
  EntryReading,
  ImageRef,
  PagesReading,
  Person,
  Question,
  Reader
} from '@server/citation-scans/reader';

import { pacedImage } from './images';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const DEFAULT_MODELS: Record<Question, string> = {
  pages: 'claude-haiku-5-5',
  dates: 'claude-haiku-5-5',
  entry: 'claude-sonnet-5-5'
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

const DATES_PROMPT = `This image is from a baptism or marriage register, whose entries run in date order. Give the earliest and the latest date of the entries on it, as YYYY-MM-DD: for baptisms, any birth or baptism date written for an entry; for marriages, the marriage (or banns) dates.

The year is often written only at the top of the page or of a section and holds for the entries below it; month names may be in Swedish, Finnish or Latin, or abbreviated.

If you can't read at least one complete date with its year, answer readable: false and leave the dates empty.`;

function entryPrompt(person: Person) {
  const known = [
    `Name: ${person.name}`,
    (person.date ?? null) === null ? null : `Date of the event: ${person.date}`,
    (person.village ?? null) === null ? null : `Village: ${person.village}`
  ].filter((line) => line !== null);
  return `Is this person written on this image?

${known.join('\n')}

The name may be written differently from how it is given here, and still be the same person:
- Swedish and Finnish forms of a name: Johan for Juho, Henrik for Heikki, Matts for Matti, Maria for Maija, Carl for Kalle, Gustaf for Kustaa.
- A patronymic instead of, or as well as, a surname: Johansson, Johansdotter, Juhonpoika, Juhontytär.
- A farm or house name standing for the surname, or no surname at all.
- Old spellings: W for V, e for ä, doubled or single letters, abbreviations, Latin forms.

The person's entry may continue from or onto another image; answer found if the person's own name is on this one. Don't confirm on a first name alone, or on a similar name that belongs to someone else: answer found only when you can read the person's name on the image, and give how sure you are as a confidence from 0 to 1.

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
      latest: { type: 'string' }
    },
    required: ['readable', 'earliest', 'latest'],
    additionalProperties: false
  },
  entry: {
    type: 'object',
    properties: {
      readable: { type: 'boolean' },
      found: { type: 'boolean' },
      confidence: { type: 'number' }
    },
    required: ['readable', 'found', 'confidence'],
    additionalProperties: false
  }
};

const UNREADABLE = { unreadable: true } as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toPages(json: { readable: boolean; pages: number[] }): PagesReading {
  const pages = json.pages.filter((p) => Number.isInteger(p) && p > 0);
  return json.readable && pages.length > 0 ? { pages } : UNREADABLE;
}

function toDates(json: {
  readable: boolean;
  earliest: string;
  latest: string;
}): DatesReading {
  const { earliest, latest } = json;
  if (!json.readable || !ISO_DATE.test(earliest) || !ISO_DATE.test(latest)) {
    return UNREADABLE;
  }
  return earliest <= latest
    ? { earliest, latest }
    : { earliest: latest, latest: earliest };
}

function toEntry(json: {
  readable: boolean;
  found: boolean;
  confidence: number;
}): EntryReading {
  if (!json.readable) return UNREADABLE;
  const confidence = Math.min(1, Math.max(0, json.confidence));
  return { found: json.found, confidence };
}

function mediaType(bytes: Uint8Array) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
}

export interface ClaudeReaderOptions {
  models?: Partial<Record<Question, string>>;
  effort?: Partial<Record<Question, Effort>>;
  // The Image's bytes; by default fetched through the image cache, paced.
  image?: (at: ImageRef) => Promise<Uint8Array>;
  client?: Anthropic;
}

export interface ClaudeReader extends Reader {
  spend: () => Record<string, Spend>;
}

export function claudeReader(options: ClaudeReaderOptions = {}): ClaudeReader {
  const models = { ...DEFAULT_MODELS, ...options.models };
  const effort = { ...DEFAULT_EFFORT, ...options.effort };
  const image = options.image ?? pacedImage;
  const client = options.client ?? new Anthropic();
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

  // The parsed answer, or null for a refusal or an answer out of shape.
  async function ask<T>(question: Question, at: ImageRef, prompt: string) {
    const bytes = await image(at);
    const model = models[question];
    const fallback = !model.startsWith('claude-haiku');
    const response = await client.beta.messages.create({
      model,
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
    record(response.model, response.usage);
    if (response.stop_reason !== 'end_turn') return null;
    const text = response.content.find((b) => b.type === 'text')?.text;
    try {
      return text === undefined ? null : (JSON.parse(text) as T);
    } catch {
      return null;
    }
  }

  return {
    models,
    spend: () => Object.fromEntries(spent),
    pageNumbers: async (at) => {
      const json = await ask<Parameters<typeof toPages>[0]>(
        'pages',
        at,
        PAGES_PROMPT
      );
      return json === null ? UNREADABLE : toPages(json);
    },
    dates: async (at) => {
      const json = await ask<Parameters<typeof toDates>[0]>(
        'dates',
        at,
        DATES_PROMPT
      );
      return json === null ? UNREADABLE : toDates(json);
    },
    findEntry: async (at, person) => {
      const json = await ask<Parameters<typeof toEntry>[0]>(
        'entry',
        at,
        entryPrompt(person)
      );
      return json === null ? UNREADABLE : toEntry(json);
    }
  };
}
