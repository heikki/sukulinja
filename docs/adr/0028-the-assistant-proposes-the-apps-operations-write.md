# The assistant proposes; the app's operations write

The assistant (ADR-0025) first only read. Heikki (2026-11-15) wanted it to make changes too, decided in the conversation itself: he asks in his own words, it proposes, and he applies what he agrees with. One example is linking a person's Facts to the Citations they already have that say the same thing.

- **A write tool only proposes.** Each write operation in the catalogue (`assistant/operations/`) names one of the dataset's own operations (ADR-0027: `addFact`, `editFact`, `support`, `editPerson`, `move`, `remind`) and builds the request body a form would send, with a label for the person and the reason Claude gives. When it's proposed, that operation's own `read` checks the body; nothing is written. Claude can also take back an item it proposed.
- **Applying goes through the operation's handler**, the same one its route calls, so its rules decide and it writes its Change, as for a form. The ticked items run in order. One that's refused (a rule says no, the dataset changed) is reported with the app's words, and the rest go on. Claude hears what was applied with the next question.
- **A Change made this way says so** (`changes.via = 'assistant'`, schema 9). Applying runs the operations inside an `AsyncLocalStorage` scope (`changes/via.ts`), and `changes.add` reads it. This covers every path that writes a Change, including the Citations', which are written outside the dataset's services. Edits made by hand at the same time run outside the scope and stay unmarked.
- **Who may be living stays left out** of writes as well: an item on such a person, or moving someone into a family that has one, is refused unless they're on screen.
- **More than 10 items applied at once take a copy of the database first**: `VACUUM INTO` the dataset folder's `backups/<time>.sqlite`. It's the whole database, Changes included, and is quick. Media files aren't copied, since no write operation touches them. To restore, the app is closed and the copy replaces `db.sqlite`.
- **A Proposal is kept with its conversation**, in memory only, and is forgotten with it.

## Considered options

- **Pass `via` explicitly** through every service and the Citations' Change path. Rejected: each service's signature would change for one caller.
- **A GEDZIP backup**, as the spec first said. Rejected by Heikki: a GEDZIP holds only what the GEDCOM export writes, so Changes and the app's own tables would be lost, and it's slower.
- **One schema library for both the operation's `read` and the tool's input** (ADR-0027 left this open). Not now: a tool's input is shaped for Claude (an edited Fact's untouched fields can be null, and `reason` is added), so it maps to the operation's body rather than copying it. The operation's `read` still checks every body.
- **An in-app Restore**: later, if backups turn out to be used. The registry already swaps a dataset's database on import.
