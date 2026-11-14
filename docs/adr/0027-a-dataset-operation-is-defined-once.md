# A dataset operation is defined once

Each thing a dataset's screens ask the app (a person, a Mark, an Entry made, a Reminder written) used to be written in five places: a `DatasetApi` member, the HTTP call with its URL in the client, a copy in the memory fake, a body parser in a route file on the server, and a handler that called the module. The request shapes were declared on both sides under the same names, so they could drift apart, and adding one operation (a Citation's text) touched 17 files.

So an operation is now defined once, in `src/common/operations/`:

- **One table, by name.** `OPERATIONS` maps each operation's name to how its request is read (`read`, which gives its input or null), what it expects (for the 400's words), and the type of its answer. Each context has its own file (tree, facts, citations, photos, reminders, changes, assistant), and the request types (`MarkTarget`, `EntryAt`, `EntryEdit` …) live there for both sides.
- **The route is the name.** Every operation is `POST /d/<slug>/api/<name>` with its input as a JSON object, ids in the body. The server reads the body by the operation's own `read` before any handler sees it, so no route parses paths or bodies of its own. Nothing but the app's webview calls these routes, so their shape was free to change.
- **The server answers by handler.** `serveOperations` (`src/server/operations.ts`) takes one handler per operation, and the type requires all of them. A handler answers its output, or throws a `Refusal` with its status (400 refused, 404 not found, 409, 502 Astia failing). An answer of nothing is 204. A streamed operation (a person's Links, the assistant's turn) answers one JSON value a line.
- **The client asks by name.** `openDatasetApi` sends each `DatasetApi` method's input to its operation. `DatasetApi` itself is unchanged, so no screen or state changed with it.
- **Not everything is an operation.** Files go as they are: an Image or a Photo's file is a GET by URL, and adding a Photo sends a form (`POST /d/<slug>/api/addPhoto`). Astia's routes are shared by every dataset (a Volume's re-scan), and the dataset lifecycle (import, export, delete) is the registry's.

## Considered options

- **Keep the REST URLs, with method and path pattern in the table.** Rejected: the table would grow, and path parsing would stay, for URLs nobody else reads.
- **A schema library (zod) for `read`.** Not now: hand-written readers are a few lines each and add no dependency. When the assistant's write tools (ticket 06) need JSON schemas for operations, generating both from one schema is worth reconsidering.

## Consequences

- A new operation is an entry in its context's table, a handler, and a `DatasetApi` method: three places, and the type checks the handler exists.
- `src/client/dataset-api/contract.test.ts` holds the HTTP adapter to the real server; a server's route tests ask operations by name.
