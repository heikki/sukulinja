Status: needs-triage

# What a good tree is, and the gaps from it

Glossary: **Fact**, **Citation**, **Entry**, **Mark** (`src/server/citations/GLOSSARY.md`), **Change** (`src/server/persons/GLOSSARY.md`), **Proposal**. Builds on ADR-0022 (Citations support Facts), ADR-0025 (the assistant reads through the app's operations) and ADR-0028 (Proposals, batches).

Heikki, 2026-11-15: rather than a feature per kind of fix, the app should know what a good tree is, so the assistant can propose steps towards it. Sources for residences were the first example: a Fact should have a source, and trees exported from MyHeritage lack that. Knowing where a tree came from (imported, and from what, or built in the app) helps the assistant tell why a gap is there.

## The idea

- **Principles** of a good tree are written down once, each as a **check** the app runs over the dataset: a fixed rule, not the model's judgement, so its answer is the same every time and costs nothing.
- A check gives its **gaps**: how many, and which (the person, the Fact or Citation, and why it's a gap).
- The assistant gets a read tool listing the checks with their counts, and one giving a check's gaps, a page at a time. Asked to "fix the gaps", it goes through one check at a time and proposes fixes as batches (ADR-0028), with its own judgement on each; a gap it can't settle becomes a Reminder.
- The same list can show in the app without the assistant (a tab or a panel, later), as a to-do of the tree.
- A gap the person has looked at and decided to leave (no source exists, the date is right after all) can be **dismissed**, so it doesn't come back. Stored per dataset, with a Change.

## Principles

From the Genealogical Proof Standard and citation practice (`.scratch/citation-practices/idea.md`), as far as the app can check them. Examples are invented.

### Sources

1. **A Fact has a source.** A Fact no Citation supports. The commonest gap in a tree from MyHeritage, which keeps sources on the person, not on the Fact. Fix: support it with one of the person's Citations, or a Reminder to look for one. One left so when the Entry supporting it was replaced (its kind or owner changed, ADR-0037) may have been taken from that Entry wrongly: deleting it is a fix too (Heikki, 2026-11-26: the Entry pane offers no deletion until this check says so).
2. **A source supports something.** A Citation supporting no Fact. Often the source says something the tree hasn't got (a residence in a communion book). Fix: support an existing Fact, or add the Fact with its source (`add_fact` with `citationIds`).
3. **A source is found on its page.** A church-book Citation whose Link is an estimate or a Match, not Marked. Only the person can fix this, in the Scan viewer (the assistant can't see scans); the list helps them get through it.
4. **A source and its Fact agree.** A Citation supporting a Fact whose date or place its Entry or transcription contradicts ("born 3.3.1761" against a Fact of 1762). Fix: a Reminder, or editing the Fact when the source is clearly right.

### Dates and people

5. **Dates are possible.** Death before birth; a child born when the mother was under 14 or over 50, or the father under 15 or over 75, or after the father's death plus nine months; a marriage before 15; a life over 100 years. These are warnings, kept strict on purpose: an exception is dismissed once and stays dismissed.
6. **A person has a birth or baptism.** Someone with neither, so their place in time rests on others' Facts.
7. **No one is in the tree twice.** Two people with the same name, close birth years and the same parents or spouse: a possible duplicate. The fix (merging people) is a feature still to come; until then, a Reminder.
8. **Everyone is connected.** Someone in no family, as a child or a spouse.

### Places and names

9. **A place is written one way.** The same place spelled differently (`Kylä, Pitäjä` and `Kylä, Pitäjä, Suomi`), or without its parish. The parish's name as Astia gives it (the app's naming rule). Fix: edit the Facts, as a batch.
10. **A residence says where.** A residence Fact with no place, as MyHeritage's copies of communion-book lines often are.

### Entries

11. **An Entry names the people the tree gives it.** A baptism Entry whose child has a father or mother in the tree not named in it. Only the person can fix it, from its Box's _Edit_; one left out on purpose (the book doesn't name the father) is dismissed with that reason. From `.scratch/source-first/spec.md`, replacing Entries tickets 07 and 08. Widened by ADR-0037 to every way the tree may differ from an Entry once changed: a marriage's couple who aren't a family, a baptism's parent who isn't the child's in the tree. It shares its rule with the Entry pane (`.scratch/entry-lock/issues/03-pane-says-where-tree-differs.md`). The app can't tell which side was taken wrongly; the fix is the person's, in the Entry pane.
12. **A Fact of a kind once.** Two Births, Christenings, Deaths or Burials of one person, or two Marriages of one family: only an import brings them, as the app adds no second. The Entry pane offers neither support then. Fix: edit or delete one in _Facts_. From ADR-0037.
13. **A person is cited once at a spot.** Two of one person's Citations whose Boxes overlap on the same Image: something has gone wrong, as two mentions of a person on a page each have a place of their own. The Boxes needn't be the same; two Boxes apart on one page are normal and aren't a gap. A transcription alike isn't the rule, as a short one ("Elsa 23. Maalis 1908") matches by chance. Found 2026-11-26: a MyHeritage reference left beside the Entry Citation made of its record, showing the person twice in People here (Heikki chose this list over a mark in People here). Fix: delete the one that's extra, usually the reference with the MyHeritage link.

### Not checked

- **A reasonably exhaustive search** (GPS 1) and **a written conclusion** (GPS 5) are the researcher's, not the data's. Searches done and found nothing would be a feature of their own (`idea.md` #5).
- **Living people** are left out of checks the assistant reads, as of everything else (ADR-0025), unless the Living people setting is on.

## Fixes belong here, not in the import

The MyHeritage import (`import/myheritage.ts`) converts the export's format: photos, private tags, face rectangles. A fix to what the tree _says_ (a place spelled one way, a Fact's source, a residence's place) doesn't belong there or in a one-off script (`scripts/tidy-places`), but here: a check finds it, and the fix is proposed and applied like any other, with its Changes. So it works on any tree, however it came in, and the person sees each fix before it's made. A content fix later wanted at import time is a check here instead.

## Where the tree came from

The assistant is told where the dataset came from, with each question, and per row in what its tools read:

- **The dataset**: the file it was imported from, when, its GEDCOM version, and the program that wrote it (the GEDCOM header's `SOUR`, e.g. MyHeritage), and how many Changes have been made in the app since. The program isn't stored yet: the import stores it from now on (dataset meta), and an older dataset's is read from its source titles where they say, else unknown. A dataset created in the app (none yet) says so.
- **A row**: whether a Fact or Citation came with the import or was made in the app. Citations know already (`madeInApp`, Entries); a Fact or person made in the app has a Change that says so.

E.g. "Imported from esimerkki.ged (MyHeritage, GEDCOM 5.5.1) on 3.11.2026; 412 Changes in the app since."

## Decided

Heikki, 2026-11-15:

- The limits in check 5 as above.
- The assistant may propose dismissing gaps, as a Proposal item with its reason (a batch for many); only applying it dismisses them.
- Fixes to the tree's content belong here, not in the import (above).

## Order

1. Where the tree came from (small, and every check reads better with it).
2. Checks 1 and 2, and the assistant's read tools for checks.
3. Checks 10 and 9: both come from the MyHeritage legacy and suit batches.
4. Checks 5 and 6, with dismissed gaps.
5. The list in the app.
6. Checks 3, 4 and 8; then 7, once people can be merged.
