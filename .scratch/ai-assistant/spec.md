Status: needs-triage

# An assistant in the app

Glossary: **Fact**, **Change** (`src/server/persons/GLOSSARY.md`), **Citation**, **Transcription** (`src/server/citations/GLOSSARY.md`). Decisions this builds on: ADR-0013 (each edit writes a Change), ADR-0021 (the tree is edited only in the app), ADR-0024 (places are written one way, and what it leaves open).

Heikki, 2026-11-13: "Tekoälyapuri ohjelmaan. Tämä uudelleen nimeys on esimerkki sellaisesta tehtävästä, minkä se voisi hoitaa." The renaming meant is ADR-0024's open end: the villages' and farms' old spellings ("Wehmais", "Kyrckoby"), a parish spelled another way ("Pieksamaki"), the rural parishes' names. A rule can't do these safely; a person can, one by one, and an assistant can do the reading and leave the deciding to him.

And (Heikki, 2026-11-13): "Pitääkö ottaa huomioon jotenkin, että paikan nimet ovat merkinneet eri juttuja eri aikakausina? Esimerkiksi Haukivuori numero 4 on voinut myöhemmin muuttua Haukivuori numero 6." Yes: see _What it may not do_.

## What the assistant is

- **A proposer, never a writer.** It reads the dataset through read-only tools and ends with a **Proposal**: a list of operations from a closed set, each with its reason. Nothing is written until Heikki confirms it, operation by operation.
- **Another caller of the same operations.** A confirmed operation runs the domain operation the app's own forms run (`facts.edit`, a new `places.rename`, …), so it is checked the same way and writes the same **Change**. The assistant has no write path of its own and never touches SQL.
- **Runs in the app's Bun process**, beside the server (`src/server/assistant/`). The webview only shows the conversation and the Proposal; the API key and the calls to Claude never reach it.
- **Claude, through the Claude API** with tools we define (`@anthropic-ai/sdk`, already used by `scripts/vision/claude-reader.ts`). Not the Agent SDK or Managed Agents: there is nothing to run in a sandbox, and the data is local.

## The first task: unify a place's spellings

1. Heikki opens **Assistant** in the side dock and asks, e.g. "yhtenäistä Haukivuoren kylien kirjoitusasut".
2. Claude reads the places with tools: `listPlaces(parish?)` gives each distinct place with how many Facts name it and the years they span; `placeFacts(place)` gives a few of its Facts with dates (no names, see _Privacy_).
3. It answers with a Proposal of `renamePlace { from, to, reason }`: "Wehmais, Haukivuori, Suomi" → "Vehmaa, Haukivuori, Suomi", 12 Facts, "Wehmais is the Swedish spelling of Vehmaa".
4. The panel lists them, each with a checkbox (unticked by default when Claude says it's unsure), the count, the reason, and an editable _to_. Heikki ticks, fixes, confirms.
5. Each confirmed rename runs `places.rename(from, to)`: every Fact naming `from` now names `to`, and one Change says so ("place renamed, Wehmais → Vehmaa, 12 facts"), on nothing, as ADR-0024's migration did.

The rename is also the manual tool: the **Places** list (ADR-0024's "a way to rename a place everywhere") calls the same `places.rename`. It comes first, and the assistant is built on it.

## What it may not do

- **Only the spelling of one name.** A rename may change how a part is written (Wehmais → Vehmaa, Kyrckoby → Kirkonkylä, Pieksamaki → Pieksämäki); it may not make two places one. "Haukivuori 4" and "Haukivuori 6" stay two places even if one later became the other: which house a number meant in which era is a research conclusion, not a spelling.
- **Checked in code, not only asked of Claude.** `places.rename` (and so the Proposal) rejects a rename whose parts don't line up one to one: a different number of comma parts, a different parish, or any number (house, farm, a year) that differs. Claude is told the same in its prompt, but the guard is what holds.
- **A place in another era** is written down, not renamed: a Proposal may carry a `note { place, text }` ("Haukivuori 4 is likely the later Haukivuori 6, see rippikirja 1840–1849 p. 112"), which becomes a Reminder on nothing, or later a note on the place, for Heikki to work on. (Open question 3.)
- **No deleting, linking or merging people,** and no Fact edits outside the operation set, until a task is specified for them.
- **The import's places are as the file writes them** (ADR-0024). The assistant tidies the tree, not a source's words: a Citation's Transcription is never rewritten.

## Structure

- **Refactor first: the dataset's operations out of the HTTP handlers.** `createDatasetHandlers` (`server.ts`) builds `facts`, `persons`, `relatives`, `changes`… and wraps them as routes in one closure. Moved to `datasets/services.ts` (`openServices(db)`), both the routes and the assistant use the same objects for the same database. Mechanical; no behaviour changes.
- **`src/server/places/`** (new): `places.ts` (`list`, `rename`, the one-to-one guard), `routes.ts` (`GET /api/places` moves here from `facts/routes.ts`, `POST /api/places/rename`). `facts.places()` goes.
- **`ChangeWhat`**: `{ kind: 'place'; did: 'rename'; was: string; now: string; facts: number }`.
- **`src/server/claude/client.ts`** (new): the client and its credentials, moved from `claude-reader.ts`, which then uses it. `@anthropic-ai/sdk` moves from devDependencies to dependencies.
- **`src/server/assistant/`** (new):
  - `tools.ts`: the read tools, each a thin call into the services, returning only what the task needs.
  - `proposal.ts`: the operation set (`renamePlace`, `note`) as a strict JSON schema; validating a Proposal against the dataset (the guard, and that `from` still has the count it was proposed with); applying the ticked operations through the services.
  - `run.ts`: the tool loop. `claude-opus-5-5`, adaptive thinking, effort `medium` (`high` if it proves too loose), streaming, `fallbacks: "default"` for a declined request, `strict: true` tools. A Proposal is the `propose` tool's input; the loop ends there.
  - `routes.ts`: `POST /api/assistant` (a task in, its progress and Proposal streamed back as NDJSON, as the import's progress is), `POST /api/assistant/apply`.
  - A Proposal is kept in memory with the conversation until applied or closed; nothing of it is stored.
- **Client:** `components/assistant/` in the side dock: the task field, Claude's progress, the Proposal checklist and _Apply_. **Settings** gets the API key.

## Key, cost, privacy

- **The key** is Heikki's Anthropic API key, kept in the macOS Keychain (`security add-generic-password`), set in Settings; in dev also from the environment or an `ant auth login` profile, as `claude-reader.ts` reads it. Without a key the Assistant tab says how to add one.
- **Cost:** a places run sends distinct place strings and counts, a few thousand lines: a few cents per run with Opus 5.5 ($4 / $20 per million tokens). The panel shows each run's tokens and dollars, as the Reader's `Spend` does.
- **Privacy:** what a tool returns goes to Anthropic. The places tools return no names; a task that reads people (see below) sends the people it reads, living ones too, and says so before it starts. API data isn't used for training.

## Later tasks, by fit

| Task                                                                                                        | Fit                                             | Needs                                         |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Unify place spellings (this spec)                                                                           | good: reading, judgment, a confirmable list     | `places.rename`                               |
| Parish names: "Mikkeli Maaseurakunta", Astia's names (ADR-0019's naming rule)                               | good                                            | the same, plus Astia's archive list as a tool |
| Fact support from Transcriptions the rules can't read (`citations/transcription.ts` labels it doesn't know) | good                                            | `support.add` as an operation                 |
| Likely duplicate people                                                                                     | good to find, but merging isn't built           | person merge (add-people "Later")             |
| Questions about the tree ("ketkä asuivat Laukolassa?")                                                      | fine, read-only                                 | person read tools; sends people               |
| Odd dates (born after the mother died, married at 12)                                                       | rules do it better; the assistant could explain | a rule check first                            |
| Reading scans                                                                                               | already done by `scripts/vision`                | shares `claude/client.ts`                     |

## Tickets

| #   | Ticket                                                                                  | Blocked by |
| --- | --------------------------------------------------------------------------------------- | ---------- |
| 01  | Dataset services out of `createDatasetHandlers`                                         | none       |
| 02  | `places.rename` with the one-to-one guard, and its Change                               | 01         |
| 03  | Places list with rename (manual)                                                        | 02         |
| 04  | Claude client shared with the Reader; key in Keychain and Settings                      | none       |
| 05  | Assistant loop, read tools and Proposal (server)                                        | 02, 04     |
| 06  | Assistant tab: task, progress, Proposal, Apply                                          | 05         |
| 07  | Glossary: **Assistant**, **Proposal**; ADR for "the assistant proposes, the app writes" | 05         |

## Open questions for Heikki

1. Is it all right to send the places (and later people) to Anthropic with your own API key? A run costs cents.
2. Places list (03) first, by hand, and the assistant after it? Recommended: the assistant is then only a faster way to fill it in.
3. A place in another era (Haukivuori 4 → 6): a Reminder for you, or a note on the place that the export writes?
4. Which spelling wins: today's Finnish (Vehmaa, Kirkonkylä) always, or as Astia or the book writes it?
