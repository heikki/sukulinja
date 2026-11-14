# A dataset's database migrates to the new schema as it opens

Every schema change so far (Reminders, the Changes, Tags) meant importing every dataset again, in dev and in the installed app, because a database built by another schema wouldn't open (ADR-0013). The reason given was that the source file isn't kept, so there's nothing to upgrade from. That holds only for a change that stores something of the GEDCOM the import used to drop. Most changes are to what the app itself keeps, and the database already holds all of that. The entries model (`.scratch/citation-practices/entries.md`) is a change of this kind: it moves the Box and the transcription from citations onto a table of their own.

So a database is now taken to the app's schema as it's opened:

- **Migrations are steps in order.** `MIGRATIONS` in `src/server/datasets/migrations.ts` lists them, each taking a database from the version before to its `to`. The latest `to` is `SCHEMA_VERSION`. A schema change is a change to `SCHEMA_SQL`, which a new database is built from, and a step that does the same to an existing one.
- **They run when the database is opened**, all of them in one transaction, with the version written at the end. A step that fails, or leaves a foreign key pointing at nothing, undoes the whole migration, and the dataset stays as it was.
- **Two processes may open it at once.** The app and the vision pass both write to it. The migration takes the write lock first (`BEGIN IMMEDIATE`) and reads the version again under it. The first process migrates, and the second finds it already done.
- **The database as it was is kept beside it**, as `db.before-migration.sqlite`, copied while the lock is held. A migration's rollback covers a step that fails, and the copy covers one that does the wrong thing without failing. It's replaced by the next migration and removed with the dataset by a re-import.
- **Foreign keys are off while the steps run.** A step can then rebuild a table the way SQLite's `ALTER TABLE` documentation describes: create the new table, copy the rows across, drop the old one and rename the new one into its place. That's how to change a `CHECK`, drop a column or move data into a new table. Adding a column needs only `ALTER TABLE ADD COLUMN`, and the column goes last in its table in `SCHEMA_SQL` too, where `ALTER TABLE` puts it.
- **A step is frozen.** It holds its own SQL and helpers, written for the schema it starts from, and uses none of the app's code, which goes on changing with the schema. A step that called the import's code would change with it, or fail on a database a version older than that code expects. A test checks that a step imports nothing but `bun:sqlite` and `migrations.ts`.
- **What the app made is kept.** A step never drops Citations made in the app, Marks, Tags, Reminders, Rejections or the Changes. It moves them to wherever the new schema holds them.
- **A new import is optional.** When a schema change stores something of the GEDCOM that wasn't stored before, the step adds its column or table empty. Importing the dataset again fills it in and merges as ADR-0013 says, whenever that's convenient.
- **Versions start again at 1, in SQLite's own `user_version`.** The old numbering, up to 11 in `meta`'s `schema_version`, is dropped, as no steps were written for it. A database from before has `user_version` 0, so it's outdated and imported again, once. A database a newer app built isn't opened either, since this app doesn't know its schema.
- **A test holds the steps to `SCHEMA_SQL`.** `schema-1.sql` is the schema as version 1 built it. The test builds a database from it with a Citation, a Tag, a Reminder and a Change made in the app, and migrates it. The result must have the same tables, columns, keys, indexes and `CHECK`s as a new database, and every row it had. A step that moves rows on purpose says so in the test. CI runs this on macOS's own older SQLite.

## Considered options

- **Keep importing again.** Rejected: every change costs an import of each dataset in two places, and the entries model and the end of the MyHeritage import (ADR-0016) are both schema changes coming up.
- **Build a new database only by running the steps, from the first schema.** Rejected: nothing could drift, but the schema would no longer be readable in one place with its comments, and every new dataset would go through every step. The test catches drift instead.
- **Rebuild from an export.** Write a GEDZIP with the old app's code, then import it with the new. Rejected: Rejections, Reminders and the Changes don't go into a GEDZIP (ADR-0013), and the old code isn't there to run.
- **Compare the stored schema text with `SCHEMA_SQL`.** Rejected: `ALTER TABLE` rewrites the stored text its own way, so a migrated table would never read the same as a new one. The test compares what SQLite reads from it instead.
- **A migration library.** Rejected: the runner is a loop over a list. A library would add a dependency for that and know nothing of the two processes or the copy.

## Consequences

- Every dataset is imported once more, into schema 1. After that, upgrading the app no longer means importing it again.
- A schema change is a commit that changes `SCHEMA_SQL`, adds a step to `MIGRATIONS` and passes the migration test.
- When the oldest version migrated is raised, its steps and `schema-<n>.sql` go, and a new snapshot of that version takes their place.
- The merge still reads the database it replaces whatever its schema (ADR-0013), for one from before schema 1 and for _Undo last import_. A database put back by _Undo last import_ is migrated when it's next opened.
