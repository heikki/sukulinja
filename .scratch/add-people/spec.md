# Adding people to the tree

Status: needs-triage

Heikki, 2026-11-11: "Henkilöiden lisäys on yksi isompi feature, mikä pitäisi kirjata ylös." Recorded here as an idea, not yet grilled or ticketed.

## Why now

Heikki decided on 2026-11-11 to cut the MyHeritage connection: Sukulinja becomes the tree's master copy. That decision is ADR-0021 (`docs/adr/0021-sukulinja-is-the-trees-master-copy.md`), and adding, editing and deleting **Facts** is `.scratch/fact-editing/spec.md`: both are the basis of this one, and nothing here repeats them. The facts spec leaves names, sex and relationships out; they belong here. Until now every person came from an import; once the app is the master copy, a person found in a church book has to be added in the app, or not at all.

## Today

- People only come with an import: `persons` (xref, `UID`, sex), `names` and `name_pieces`, and the families they're in (`families` with husband and wife, `family_children` in order). ADR-0013: everyone has a `UID`, which is what says who is who across files.
- The app makes Citations, Tags, Reminders and Changes on people who exist, but no people, families or Facts.
- Where a new person would be wanted, the app offers only people who exist: the card menu (Build tree from here, Add reminder…) and the person picker's "Someone else…" (`components/person-search/pick.ts`), used by the Scan viewer and the Photo viewer.

## The idea

- **Add a relative from a card's menu**: _Add father…_, _Add mother…_, _Add spouse…_, _Add child…_, _Add sibling…_. Each asks the new person's name and sex, then puts them in the right family:
  - A parent goes into the family the person is a child in, or a new one with only that parent.
  - A spouse starts a new family with the person. A marriage (`MARR`) is then added to it with the facts spec's form, which needs the family to exist.
  - A child goes into one of the person's families, picked when there's more than one, or a new one with only them.
  - A sibling goes into the person's parents' family, made with no parents if there's none.
- **Or link someone who's already in the tree** in that place, from the same menu: the person search in place of the name form. A church-book entry often names someone the tree has, and a second copy of them is the mistake to avoid.
- **A duplicate check** before a new person is made: people with a name alike (the person search's matching) are offered first, "Is it one of these?".
- **Add someone from the Scan viewer**: the picker's "Someone else…" also offers _New person…_, so the person an Entry names can be made and cited in one go, linked as the Entry tells (a baptism's child to its father and mother, a marriage's couple as spouses). The Photo viewer gets the same, for a Tag.
- **A new person's facts** (birth, death, a residence) are entered with the fact form of the facts spec, right after the name, not with a form of this feature's own.
- **Each is a Change**: a person added, or linked to another as a parent, spouse or child, on that person. Picking it selects them.
- **The chart takes the new person in place**: they're selected, and the chart moves to them as when re-rooted.

## What a new person is in the database

- A `persons` row with a new random `UID` (ADR-0013) and a new xref that no import gave, and their sex: `M`, `F`, `X` or `U`, GEDCOM 7's values.
- One `names` row: given names and surname, its `full_text` written the GEDCOM way (`Matti /Virtanen/`). A patronymic, farm name or a name at birth are for name editing (see open questions), not this.
- A family is a `families` row with a new xref and `UID`; a child a `family_children` row at the end of its order.
- No marker that the app made it: with MyHeritage cut there's no re-import to tell the app's people from the import's. The export writes them like everyone else.

## Open questions

- **Editing a person's name and sex**, and more than one name (a woman's name at birth and married, a farm name): the facts spec leaves them out, so they're this feature's. In the same tickets as adding, or after?
- **Deleting a person, or unlinking them from a family.** Deleting takes their names, facts, Citations, Tags and family places with them (the facts spec's helper that deletes what a person or fact holds does most of it), and leaves Changes and Reminders on nothing, as a person gone does now. Wanted in the same feature, or later?
- **Merging two people** who turn out to be one: the duplicate check only prevents it going forward. Later, probably its own feature.
- **Family order**: is a child put last, or by birth date once one is known? Is a person's second spouse ordered by marriage date?
- **Who's a "parent" in a family with two of the same sex**, as GEDCOM 7 allows: husband and wife columns say nothing of sex. Probably as entered, first `husband_id`.
- **Undo**: is a person added by mistake deleted, or is there an Undo on its Change?

## Architecture notes

- **Server**: a `persons` module beside `citations` and `photos` (`src/server/persons/`): creating a person, a family, putting someone in a family, with their routes and `DatasetApi` calls, each writing its Change. The facts spec's `src/server/facts/` is its neighbour: one module per kind of record, sharing the helper that deletes what a person, family or fact holds (notes, media links, citations, addresses).
- **xref and `UID`** come from one place that both persons and families use, so a new xref never clashes with an imported one (`I<n>` / `F<n>` past the largest).
- **The tree**: the chart and panel read `persons`, `names`, `families` as today (`server/tree.ts`, ADR-0014's window). A new person needs the client's people map and the window brought up to date after the change, as an import does now, not a reload; how much is resent is to be settled.
- **The relation wording** (father, mother, spouse, child, sibling) is worked out once, from the families, for the card menu and the Scan viewer alike; `components/person-search/choices.ts` already works out a person's family for the picker and is the natural place to grow it.
- **Glossary**: _Person_ and _Family_ have no entry yet; they go in a context of their own (a "Tree" or "People" GLOSSARY.md) when this is grilled.

## Related

- ADR-0021 and `.scratch/fact-editing/spec.md`: the basis of this. ADR-0021 asks whether importing into an existing dataset goes away; if it stays, a person added here has to survive a re-import, which this spec assumes it needn't.
- `.scratch/citation-practices/entries.md`: an Entry names the people in it with their Roles; adding the ones the tree lacks is where this feature is most used.
- `.scratch/photos/spec.md`: the person picker this extends.
