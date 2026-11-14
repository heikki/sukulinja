Status: resolved

# An Entry edited as a whole, in one module

Glossary: **Entry**, **Citation**, **Role**, **Transcription**, **Box**, **Support**, **Mark**, **Change** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0026 (_An Entry is edited as a whole_, _Moving an Entry's Box isn't a Mark_, _A Role changed keeps the person's Citation_). Builds on ADR-0022 (support), ADR-0012 (stores change through verbs).

## Where it is now

- Saving an edited Entry in the Scan viewer is a run of requests from `state/pending-entry.ts` (`saveEdit`): a Mark of one of its Citations to move the Box, then `transcribe`, then `addToEntry` for each person named, then `uncite` for each taken out. One refused or failing part leaves the Entry half edited.
- Moving the Box goes through `citations.mark`'s `moved` branch and `moveEntry`, and writes one `mark` Change on that one Citation; retyping writes one `transcribe` Change on the first Citation. ADR-0026 says one on each of its Citations.
- A Role changed is the person's Citation removed and a new one made, losing its quality, notes and support.
- Entry writes are spread over `citations/entries.ts`, `entry-citations.ts`, `entry-roles.ts`, `retext.ts`, `app-citations.ts` and `citations.ts`. The client's memory adapter has its own copy of their rules (`dataset-api/memory-entries.ts`).
- `POST /api/persons/:id/citations` (`routeCite`, `handleCite`, `citations.cite`, `CiteTarget`) isn't in `DatasetApi`; only `server.test.ts` calls it.

## What to build

### The Entry module

`src/server/citations/entries/`, its `index.ts` the interface, and beside it the storage (today's `entries.ts`, with `CITATIONS_READ`), the Roles (`entry-roles.ts`) and the gathering and merging (`gatherEntries`, `mergeEntries`). `annotations.ts` stays the one other module that knows an Entry's columns.

- **`make(at, text, people)`**: today's `citeEntry`. The Entry's Citations as the Scan viewer lists them.
- **`edit(entryId, { at?, text?, people? })`**: the Entry as it should be; a part left out stays. The Entry's Citations as the Scan viewer lists them; null when there's no such Entry or someone named isn't a person; `{ rejected }` with nothing written otherwise refused.
  - Checks first, on the Entry as it would be after: every Role one of its Book's, no one named twice, no one it names with another Citation linking its Image (its own Citations don't count; a move to another Image checks everyone), its Box citable there (`images.imageToCite`). No one named: `Name someone in it.`
  - Then, in one transaction: the Box moved, the Transcription put (tidied, `plainText`), the people diffed by person: those named anew get a Citation in their Role with its support, as `make` does; those no longer named have theirs removed, with its support; those whose Role changed keep their Citation and get the Role set, the support the new Role plainly gives added (`support.recorded`), none taken back.
- **`unname(citationId)`**: removes a person's Citation of an Entry; removing the last removes the Entry.
- **`remove(entryId)`**: today's `deleteEntry`, in one transaction.

### Changes

- A Box moved: a new kind `{ kind: 'move'; volume; image }` on each of the Entry's Citations. Changes written before as `mark` with `moved: true` stay and read as they were written.
- A Transcription retyped: `transcribe` on each of its Citations.
- A Role changed: a new kind `{ kind: 'role'; volume; image; from; to }` on that person's Citation.
- Named and taken out: `cite` and `uncite`, as now.
- `changes-list/helpers.ts` words the two new kinds.

### What goes, and what uses it

- `citations.mark` is for Church-book references only and refuses a Citation of an Entry; its `moved` branch and `moveEntry` go.
- `addToEntry` and `transcribe` go from `Citations`, the routes and `DatasetApi`. The Box menu's _Add person_ is `editEntry` with the Entry's people and one more.
- `retext` of a Citation of an Entry is `edit(entryId, { text })`; of any other Citation, as now.
- `uncite` of a Citation of an Entry is `unname`; of any other, as now.
- `POST /api/persons/:id/citations` and `citations.cite` / `CiteTarget` go; their `server.test.ts` cases move onto `POST /api/entries`.
- The route: `PUT /api/entries/:id` takes `{ at?, text?, people? }` and answers the Entry's Citations.

### The client

- `DatasetApi.editEntry(entryId, { at?, text?, people? })`; `pending-entry.saveEdit` makes one call and keeps who of those it had are still in it from the answer.
- `memory-entries.ts` goes. The Entry state tests (`entry-edit.test.ts`, `cite.test.ts`, and `entry-box`'s) build their api over the in-process server, as `contract.test.ts` does (`createApi` with `memoryAstia`), and check what the Entry is after, not the order of requests.
- `editEntry` joins `contract.test.ts`.

## Done when

- Saving an edited Entry is one request, and a refused one changes nothing.
- Server tests of the Entry module, through its interface: an edit moving the Box, retyping and naming and unnaming in one go; a refused part writing nothing; a Role changed keeping the Citation's notes and support; a move onto an Image someone named already cites refused; the last person unnamed removing the Entry; the Changes each writes, on each Citation.
- `bun run format`, `lint`, `typecheck` and the tests pass.
