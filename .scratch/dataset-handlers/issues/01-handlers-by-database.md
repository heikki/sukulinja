Status: ready-for-agent

# Look a dataset's handlers up by its open Database, and give the chart's queries their own module

## The bug

`createApi` keeps its own `handlersBySlug` cache of handlers, each bound to a `Database` the registry may close:

1. An import clears `handlersBySlug` when it starts.
2. While it streams, a request for that dataset calls `registry.open(slug)`, gets the **old** Database, and caches handlers on it.
3. `commit()` closes the old Database and drops it from the registry's cache; `handlersBySlug` keeps the handlers bound to it.
4. Every later request for the dataset answers 500 ("closed database") until the app restarts.

Requests already running aren't at risk: each reads the Database synchronously when it starts, and not after an `await`.

## Steps

1. **Handlers by Database** (`server.ts`):
   - `createApi` keeps a `WeakMap<Database, DatasetHandlers>`. A request's handlers are those of `registry.open(slug)`'s Database, created on first use.
   - The registry alone decides when a Database is replaced: after a commit or a delete, `open()` gives a new one, and so new handlers.
   - Remove `handlersBySlug`, its `clear()` on `/import`, and the `handlersBySlug` parameter and `delete` in `handleDeleteDataset`.
2. **Tree** (new `src/server/tree.ts`): `createTree(db)` returns `{ persons(): PersonRow[]; families(): FamilyRow[] }`, what the chart is drawn from, as `person-details.ts` is what the panel shows.
   - Moves in from `server.ts`: the persons and families SQL, the row mapping, `parseYear` and the crop rule.
   - `handlePersons` and `handleFamilies` become `Response.json(tree.persons())` and `Response.json(tree.families())`.
3. Leave `createFresh` alone: deleting it is candidate #12.

## Acceptance

- **`server.test.ts`**, through `createApi` on a temp data folder:
  - GET a dataset's persons; stage and commit a new import of the same slug directly through the registry (not `/import`, so nothing clears a cache); GET again gives the new persons, not a 500. Fails on the code before this change.
  - After `DELETE /datasets/<slug>`, its persons answer 404.
- **`tree.test.ts`**, on `:memory:` from a small GEDCOM:
  - birth and death years read from dates such as "ABT 1757"; null without a date
  - the primary photo chosen by `is_primary`, then `sort_order`, then `id`
  - `crop` null unless all four sides are set
  - persons sorted by surname, then given name, ignoring case
  - each family's children in GEDCOM order
- `bun run format`, `bun run lint`, `bun run typecheck` and `bun test` pass.
- **In the app**, on a throwaway dataset (never `ylonen` or `bourbon`): import a GEDCOM as `scratch`, keep it open, import it again as `scratch`, then open it. The chart shows, with no 500s in the server log. Delete `scratch` afterwards.
