# Adding people to the tree

Status: ready-for-agent

Heikki, 2026-11-11: "Henkilöiden lisäys on yksi isompi feature, mikä pitäisi kirjata ylös." Open questions settled with Heikki the same evening; tickets in `issues/`.

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
- **Add someone from the Scan viewer**, always as a relative of the Selected person, never as someone linked to no one. The picker lists the Selected person's family as now, and under them _New father…_, _New mother…_, _New spouse…_, _New child…_, _New sibling…_ of the Selected person: the same adds as the card menu, with the new person cited from the Entry in the same go. "Someone else…" stays a search of people who exist. The Photo viewer gets the same, for a Tag.
- **The first person starts a new dataset.** Today a dataset only comes from an import, and the chooser offers nothing else ("No datasets yet" → Import). Beside _Import_ comes _New dataset…_: it asks the dataset's name and its first person's name and sex, and that person is the Root. Everyone after them is added as a relative, as below. This is the only person made with no place in the tree, since there's no tree yet.
- **No one is added unlinked.** Every new person is made in a place in the tree, from a card or relative to the Selected person, so the chart can always reach them.
- **A new person's facts** (birth, death, a residence) are entered with the fact form of the facts spec, right after the name, not with a form of this feature's own.
- **Each is a Change**, on the person: a `ChangeWhat` of kind `person` whose `did` is `add` (done: _Added as father · of Juho Virtanen_), and later `link`, `unlink`, `edit` and `delete`, written the way the panel names them (_Added Matti Virtanen as father of Juho Virtanen_), so the Change reads the same once they're gone. Picking one selects them. The person's `CHAN`, and the family's, gets today's date and time, as the facts spec does.
- **The chart takes the new person in place**: they're selected, and the chart moves to them as when re-rooted.

## What a new person is in the database

- A `persons` row with a new random `UID` (ADR-0013) and a new xref that no import gave, and their sex: `M`, `F`, `X` or `U`, GEDCOM 7's values.
- One `names` row: given names and surname, its `full_text` written the GEDCOM way (`Matti /Virtanen/`). A patronymic, farm name or a name at birth are a later feature (see Decisions).
- A family is a `families` row with a new xref and `UID`; a child a `family_children` row, in birth order (see Decisions).
- No marker that the app made it: with MyHeritage cut there's no re-import to tell the app's people from the import's. The export writes them like everyone else.

## Decisions (Heikki, 2026-11-11)

- **Name and sex are edited in this feature**, in the same tickets as adding, so a typo in a new person's name is fixed at once. One name per person for now.
- **A person added by mistake is deleted**, from the card's menu, and the deletion is a Change. No Undo of its own. The same deletion works for imported people, since nothing brings them back now (ADR-0021). Deleting takes their names, Facts, Citations, Tags and places in families with them, through the facts spec's helper for what a person or Fact holds; their Changes and Reminders stay, on nothing, as a person gone does now. A family left with no one in it goes too.
- **A person is unlinked from a family** without deleting them: _Remove as child_, _Remove as spouse_. A family left with no one goes, one left with one person stays.
- **Nothing cuts the tree in two** (Heikki, 2026-11-11). A deletion or an unlinking that would leave someone no longer connected to the Root through families isn't offered: the card's menu simply lacks _Delete person…_ or that _Remove as …_, with no explanation (Heikki). The server refuses it all the same. The way out is to delete or relink the ones at the far end first, from the outside in. A part that was already unconnected after an import doesn't stop it; only what the change itself would cut off counts.
- **Children are ordered by birth date** when it's known, else in the order they were added: the order is written to `family_children` when a child is added and when a child's birth (or baptism) date changes.
- **Later, each its own feature**: more than one name (at birth, married, a farm name), and merging two people who turn out to be one. The duplicate check keeps new copies from being made meanwhile.
- **Who's the "parent"**: as entered. The first parent of a family is `husband_id`, the second `wife_id`, whatever their sex; GEDCOM 7 allows two of the same.
- **What the Root is after a deletion**: deleting the Root makes the Selected person's nearest relative the Root (a parent, else a spouse, else a child); the last person in a dataset can't be deleted.

## Architecture notes

- **Server**: a `persons` module beside `citations` and `photos` (`src/server/persons/`): creating a person, a family, putting someone in a family, with their routes and `DatasetApi` calls, each writing its Change. The facts spec's `src/server/facts/` is its neighbour: one module per kind of record, sharing the helper that deletes what a person, family or fact holds (notes, media links, citations, addresses).
- **xref and `UID`** come from one place that both persons and families use, so a new xref never clashes with an imported one (`I<n>` / `F<n>` past the largest).
- **The tree**: the chart and panel read `persons`, `names`, `families` as today (`server/tree.ts`, ADR-0014's window). A new person needs the client's people map and the window brought up to date after the change, as an import does now, not a reload; how much is resent is to be settled.
- **The relation wording** (father, mother, spouse, child, sibling) is worked out once, from the families, for the card menu and the Scan viewer alike; `components/person-search/choices.ts` already works out a person's family for the picker and is the natural place to grow it.
- **Glossary**: _Person_ and _Family_ have no entry yet; they go in a context of their own (a "Tree" or "People" GLOSSARY.md) when this is grilled.

## Related

- ADR-0021 and `.scratch/fact-editing/spec.md`: the basis of this. ADR-0021 ends importing into an existing dataset, so a person added here needn't survive a re-import.
- `.scratch/citation-practices/entries.md`: an Entry names the people in it with their Roles; adding the ones the tree lacks is where this feature is most used.
- `.scratch/photos/spec.md`: the person picker this extends.

## Tickets

| #   | Ticket                                                             | Blocked by          |
| --- | ------------------------------------------------------------------ | ------------------- |
| 01  | ~~Add a parent, spouse, child or sibling from a card's menu~~ done | none                |
| 02  | Link someone already in the tree, and the duplicate check          | 01                  |
| 03  | Edit a person's name and sex                                       | 01                  |
| 04  | Order children by birth date                                       | 01, fact-editing 04 |
| 05  | Unlink a person from a family                                      | 01                  |
| 06  | Delete a person                                                    | 05, fact-editing 06 |
| 07  | New relatives from the Scan viewer's and Photo viewer's picker     | 01                  |
| 08  | Start a new dataset with its first person                          | 01                  |
| 09  | Glossary: Person, Family and the new Change kinds                  | 01                  |
