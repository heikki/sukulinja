Status: ready-for-agent

Built on its own branch (`claude/project-thread-drq6ud`) and tested there; nothing goes to master until Heikki says so (2026-11-13).

# An assistant in the app

Glossary: **Change** (`src/server/persons/GLOSSARY.md`), **Fact**, **Citation**, **Transcription** (`src/server/citations/GLOSSARY.md`), **Reminder**. Decisions this builds on: ADR-0013 (each edit writes a Change), ADR-0021 (the tree is edited only in the app).

Heikki, 2026-11-13: an AI assistant in the app, kept general; renaming places was only one example of what could be asked.

## What it is

An **Assistant** tab in the corner lists (beside Reminders, Changes, Church books and Photos) where Heikki writes, in his own words, what he wants to know or have done with the dataset. Claude answers from the dataset, and when the answer is a change, it proposes it for Heikki to confirm.

- **It reads freely and writes nothing itself.** Reading tools answer directly. Anything that would change the dataset ends up in a **Proposal**: a list of operations, each with its reason, that Heikki ticks, edits and applies. Nothing is written before that.
- **It can only do what the app can do.** Its tools are the app's own operations (add a Fact, edit a person's name, add a Reminder, support a Fact with a Citation…), so an applied operation is checked by the same rules and writes the same **Change** as the form that does it by hand. It has no write path of its own and never touches SQL. A task the app has no operation for gets the answer "the app can't do that yet"; the operation is then a feature of its own, built for the forms first.
- **It knows what Heikki is looking at:** the dataset, the selected person, an open scan. "Lisää tälle syntymäpäivä kastekirjasta" means the person on screen.
- **It runs in the app's Bun process**, beside the server (`src/server/assistant/`). The webview shows the conversation and the Proposal; the API key and the calls to Claude never reach it.

## Examples of what Heikki could ask

- "Yhtenäistä Haukivuoren kylien kirjoitusasut." Reads the places, proposes renames.
- "Ketkä asuivat Laukolassa 1840-luvulla?" Answers from the Facts, proposes nothing.
- "Onko tässä puussa tuplahenkilöitä?" Lists likely ones, with why; merging waits for its own operation.
- "Mitkä tämän henkilön lähteet tukevat syntymää, ja onko niissä ristiriitoja?" Reads Citations and Transcriptions, proposes support.
- "Lisää muistutus tarkistaa Matin kuolinpäivä rippikirjasta." Proposes a Reminder.
- "Missä järjestyksessä Liisan lapset ovat, ja onko joku väärässä paikassa?" Reads, proposes a move.

## What it may not do

- **Rewrite what a source says.** A Citation's Transcription and an imported record are evidence; the assistant tidies the tree, not the sources.
- **Turn a conclusion into a fact.** What follows only from research is written down as a Reminder for Heikki, not as an edit. For example, a place name meant different things in different eras: house Haukivuori 4 may later be Haukivuori 6 (Heikki, 2026-11-13). The assistant may fix a spelling, but saying that two houses are one is a conclusion.
- **Lean on its prompt for safety.** Each operation's own rules (`facts.edit`, `persons.edit`, the tree-cut rule…) decide what's allowed when a Proposal is applied, just as they do for a form. A new operation that needs a stricter rule for bulk use (a place rename refusing to change a house number) has it in the operation, not in the prompt.

## Structure

This needs two refactors first, so the assistant is another caller of the app's operations rather than a copy of them.

1. **The dataset's operations out of the HTTP layer.** `createDatasetHandlers` (`server.ts`) builds `facts`, `persons`, `relatives`, `changes`… inside the route closure, and some operations live in the routes themselves (a Citation's support is in `citation-routes.ts`'s `handleSupport`). Moved to `datasets/services.ts` (`openServices(db)`): the routes become thin readers of requests over the services, and the assistant uses the same objects for the same database. No behaviour changes.
2. **An operation catalogue.** Each operation the assistant may use is described once: its name, a description written for Claude, its input schema, whether it reads or writes, and the service call it makes (`src/server/assistant/operations/`, one file per area: persons, facts, citations, reminders, places…). The tools are generated from it, so adding an operation to the app and to the assistant is one entry. Validation stays in the services.

Then:

- **`src/server/claude/client.ts`:** the Anthropic client and its credentials, moved from `scripts/vision/claude-reader.ts`, which then uses it. `@anthropic-ai/sdk` moves from devDependencies to dependencies.
- **`src/server/assistant/`:**
  - `run.ts`: the tool loop over the Claude API. `claude-opus-5-5`, adaptive thinking, effort `medium`, streaming, `fallbacks: "default"` for a declined request, `strict: true` tools. Read tools run at once; write tools only add to the Proposal.
  - `proposal.ts`: a Proposal is the write operations in order, each with its input and reason. Applying runs the ticked ones through the catalogue, one by one; one that's refused (the dataset changed, a rule says no) is reported and the rest go on.
  - `routes.ts`: `POST /api/assistant` (a message in, Claude's progress and answer streamed back as NDJSON, as the import's progress is) and `POST /api/assistant/apply`.
  - The conversation and its Proposal are kept in memory while the tab is open; nothing of them is stored (open question 3).
- **Client:** `components/assistant/`: the conversation, the Proposal checklist with _Apply_, and each run's cost. **Settings** gets the API key.

## Key, cost, privacy

- **The key** is Heikki's Anthropic API key, kept in the system's credential store (`Bun.secrets`: the Keychain on macOS) and set in Settings; in dev it can also come from the environment or an `ant auth login` profile, as `claude-reader.ts` reads it. Without a key the tab says how to add one.
- **Cost:** Opus 5.5 is $4 / $20 per million tokens. A question about one person costs about a cent; a sweep over the whole tree costs tens of cents. The tab shows each answer's tokens and dollars, as the Reader's `Spend` does.
- **Privacy:** whatever a tool returns goes to Anthropic, including living people's names and dates when a question reads them. API data isn't used for training. The tools return only what a question needs, not whole records.

## Tickets

| #   | Ticket                                                                                              | Blocked by |
| --- | --------------------------------------------------------------------------------------------------- | ---------- |
| 01  | Dataset services out of the HTTP layer                                                              | none       |
| 02  | Operation catalogue: read operations                                                                | 01         |
| 03  | Claude client shared with the Reader; key in the credential store and Settings                      | none       |
| 04  | Assistant loop and route, read-only answers                                                         | 02, 03     |
| 05  | Assistant tab: conversation, what's on screen, cost                                                 | 04         |
| 06  | Write operations in the catalogue, Proposal and _Apply_                                             | 04         |
| 07  | Glossary: **Assistant**, **Proposal**; ADR for "the assistant proposes, the app's operations write" | 06         |

A place rename (Heikki's example) is not in these tickets. It's an operation the app doesn't have yet, so it's a feature of its own (a Places list with rename), and the assistant gets it as one more catalogue entry.

## Decided by Heikki, 2026-11-13

All as recommended:

1. **What a question reads goes to Anthropic** with his own API key (API data isn't used for training), but **living people are left out** unless the question is about them: the read tools leave out anyone who may be living (no death recorded, and born within 110 years or with no birth year), saying only how many were left out, except the person on screen.
2. **Read-only first** (tickets 01–05); Proposals (06) after he has used it for a while.
3. **A conversation is forgotten**: it's kept in the app's memory only, until _New conversation_ or the app closes, and never written to disk.
4. **A Change made through the assistant says so** ("via assistant"). For ticket 06.
5. **Applying a large Proposal takes a GEDZIP backup first.** For ticket 06.
