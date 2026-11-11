Status: needs-triage

# Add, edit and delete Facts

Glossary: **Fact**, **Event**, **Citation**, **Change** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0021 (Sukulinja is the tree's master copy), amending ADR-0013. Related: `.scratch/add-people/spec.md` (adding people), `.scratch/citation-practices/fact-citations.md` (Citations on Facts).

Heikki, 2026-11-11: "Onko meillä tikettiä tai paikkaa jo faktojen lisäämiselle, muuttamiselle ja poistamiselle?" and then "Voidaan päättää, että yhteys MyHeritageen katkaistaan."

The panel's _Events_ lists a person's Facts and their marriages' (`person-details.ts`), read only. Corrections had to be made in MyHeritage and imported again. Now the tree is worked on in the app, and a Fact is added, corrected or deleted where it's shown.

## Open, for Heikki

1. **Import into an existing dataset.** With the app as the master, importing over a dataset would replace the edited tree. Recommended: **import only makes a new dataset.** The merge (`import/merge*.ts`), _Undo last import_ and the import review go, in a ticket of their own after this feature, and a GEDZIP backup is restored by importing it as a new dataset. Alternative: keep importing a GEDZIP over a dataset as a plain restore, replacing it, with no merge. Until decided, ticket 01 only refuses a MyHeritage export over an existing dataset.
2. **The GEDCOM 5.5.1 export** (`export/gedcom551.ts`, _Export for MyHeritage_). Heikki doesn't upload back. Recommended: remove it with the import.
3. **Place names.** A Fact's place is text (`facts.place`), and the tree's places are spelled as MyHeritage spelled them. Recommended: a free text field that suggests the places already in the dataset, so a known place is picked rather than typed again. A place list of its own (with parish, coordinates) would be a feature of its own.

## Decided (proposed)

- **Where:** in the person panel's _Events_, on each Fact: _Edit_ and _Delete_ in a row menu, and _Add event_ below the list. _Events_ is shown even when a person has none, so there's somewhere to add the first.
- **What can be added:** the kinds the tree uses, in this order: Birth, Christening, Death, Burial, Residence, Occupation, Marriage, Divorce, Emigration, Immigration, Census, Event (with a type). Other GEDCOM kinds an import brought are shown and edited as now, but not offered. The kinds and their labels live in one module, `src/common/facts.ts`, which `FACT_LABELS` moves into.
- **What can be edited:** date and place, the value of an attribute (an occupation's title), and an Event's type. A Fact's kind isn't changed: delete it and add another. Everything else stored on the Fact (coordinates, address, age, cause, agency, notes, media, Citations) is kept as it was.
- **Dates are typed the way the panel shows them:** `3.3.1761`, `3/1761`, `1761`, `n. 1761`, `ennen 1761`, `1761 jälkeen`, `1870–1879` (also with a hyphen), `1870–`, `–1879`. `src/common/dates.ts` gets the inverse of `gedcomDate`, stored as GEDCOM 7 (`3 MAR 1761`, `ABT 1761`, `BEF 1761`, `AFT 1761`, `BET 1870 AND 1879`, `FROM 1870`, `TO 1879`); a test holds the two to a round trip. Input that isn't one of these is refused with the forms listed. A date the app can't show (another calendar, a date phrase) is shown as stored and kept unless it's changed. An empty date is allowed.
- **Several of a kind are allowed**, two births too: conflicting Facts are evidence to keep until it's resolved. The chart's years use the first (`tree.ts` already takes `LIMIT 1`), so a Fact's `sort_order` decides; a new one goes last.
- **A marriage is its family's Fact.** _Events_ shows it on both spouses, with the spouse's name, and editing it from either edits the same row. Adding a marriage asks which family, when there's more than one; with no family it isn't offered, as making a family is adding a relationship (`.scratch/add-people/spec.md`).
- **Deleting asks first**, naming the Fact. Its Citations move up to its person (or family), so the evidence isn't lost; its notes, media links and address go with it. The person's Citations list then shows them, as it shows every person-level Citation today.
- **Each edit is a Change**, on the person whose panel it was made in: _Added Birth 3.3.1761, Haukivuori_, _Changed Birth from 3.3.1761 to 4.3.1761_, _Deleted Residence 1870–1879_. The `ChangeWhat` kinds `fact-add`, `fact-edit` and `fact-delete` carry the kind and the Fact as it was and as it became, written the way the panel shows it, so the Change reads the same once the Fact is gone. Picking one selects the person, as a deleted Citation's does.
- **The record's `CHAN` is updated**: the person's, or the family's for a marriage, gets today's date and time, which the GEDZIP writes. A Change is the app's own history; `CHAN` is what other programs read.
- **The chart follows**: a changed birth or death updates the person's card, through the dataset's state (ADR-0012) reloading the person and their window.
- **Exports write nothing new**: a Fact is written as stored, wherever it came from. A Fact made in the app has no `NOTE Added in Sukulinja`; the tree is the app's now.
- **Not in this feature:** adding people, names, sex and relationships (`.scratch/add-people/spec.md`); a Fact's notes, media and Citations (citing a Fact, `.scratch/citation-practices/fact-citations.md`, step A); a place list; deleting the placeless RESI Facts in bulk (ADR-0021).

## Structure

- **Server:** `src/server/facts/`, its own module beside `reminders/`: `facts.ts` writes a Fact and its Change in one transaction, `routes.ts` answers `POST /datasets/:slug/facts`, `PATCH …/facts/:id` and `DELETE …/facts/:id`. It validates the kind against `common/facts.ts` and the date through `common/dates.ts`.
- **What a Fact owns** (Citations, notes, media links, address, all by `scope_type`/`owner_type`, with no foreign key) is removed in one helper, which deleting a person can use too, rather than each caller knowing the polymorphic tables.
- **Client:** _Events_ becomes its own component, `person-panel/events.ts`, as `family.ts` and `photos.ts` are, before it gets the editing. The form is a small dialog like the Reminders', not inline editing in the `<dl>`.
- **`FactRow`** gains the Fact's id, whether it's the person's or the family's, its type and value as stored, and its raw date, so the panel can edit what it shows.

## Refactors first

No behaviour change, each a commit, tests passing unchanged:

1. Fact kinds and labels into `src/common/facts.ts`.
2. _Events_ into `person-panel/events.ts`.
3. `FactRow` with id, owner, type, value and raw date.

## Tickets

| #   | Ticket                                                                | Blocked by |
| --- | --------------------------------------------------------------------- | ---------- |
| 01  | Refuse a MyHeritage export over an existing dataset (ADR-0021)        | none       |
| 02  | The refactors above                                                   | none       |
| 03  | Typed Finnish dates to GEDCOM, round trip with `gedcomDate`           | none       |
| 04  | Edit a Fact's date, place, value and type, with its Change and `CHAN` | 02, 03     |
| 05  | Add a Fact, a marriage to a chosen family                             | 04         |
| 06  | Delete a Fact, its Citations moved to its owner                       | 04         |
| 07  | Allow deleting imported and converted Citations (ADR-0021)            | none       |
| 08  | Remove the re-import, or keep it as a restore (open question 1)       | 01         |
| 09  | Remove the 5.5.1 export (open question 2)                             | none       |
| 10  | Glossary: **Fact** made in the app too; the new Change kinds          | 04         |
