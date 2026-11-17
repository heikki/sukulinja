Status: ready-for-agent

# Source first: a new tree from its church-book Entries

Glossary: **Entry**, **Event**, **Role**, **Transcription**, **Fact**, **Support**, **Register** (`src/server/citations/GLOSSARY.md`); **New dataset**, **Relative**, **Cut** (`src/server/persons/GLOSSARY.md`). Decision: ADR-0033. Builds on ADR-0022 (support), ADR-0023 (places), ADR-0026 (Entries). Replaces `.scratch/entries/source-first.md` and Entries tickets 07–09.

Heikki, 2026-11-17: start a new tree from scratch, source first. Research starts in the church books; an Entry is found, and the tree is built from what it says. Examples below are invented.

## How it goes

1. A new dataset starts as now, from its first person (name only).
2. Church books: open their parish's baptisms, find the first person's baptism, _New entry here_, draw the Box.
3. The card: kind _Baptism_ (first guess), child = the first person, _Born_ 3.3.1761, _Baptised_ 5.3.1761, village Esimerkkilä, farm Mäkelä; Father and Mother _New father…_ / _New mother…_ with their names as the tree writes them.
4. Save, with the card's _Add Birth_ and _Add Christening_ left ticked: the Entry, the parents as a new family with the child in it, the child's Birth and Christening at "Mäkelä, Esimerkkilä, <parish>", each supported by the child's Citation. One Change for each.
5. From the parents: their marriage, their burials, the household lines in the rippikirjat, each the same way.

## The card

- **Kind** first: Baptism, Marriage, Burial, Household line. A Volume may hold several Registers and its name doesn't tell, so the first guess is the kind of the nearest Entry before it in the Volume (same Image above it, else earlier Images), else the Book's (`entryEvent`), else none chosen. Changing the kind changes the Roles and fields shown.
- **Fields** by kind (all optional, as the book writes them; dates in the app's date form):

  | Kind           | Event  | People (Role)         | Fields                                   | Facts it makes      |
  | -------------- | ------ | --------------------- | ---------------------------------------- | ------------------- |
  | Baptism        | `CHR`  | Child, Father, Mother | Born, Baptised, village, farm            | child's BIRT, CHR   |
  | Marriage       | `MARR` | Groom, Bride          | Married, village, farm                   | family's MARR       |
  | Burial         | `BURI` | one person, no Role   | Died, Buried, village, farm              | person's DEAT, BURI |
  | Household line | `RESI` | one person, no Role   | village, farm (date: the Volume's years) | person's RESI       |

  The place is the farm, village and the Volume's archive's parish, written as ADR-0023 writes a place. Age, cause, godparents and the rest stay in the Transcription (edited in _Sources_, as now).

- **People:** a Role takes someone in the tree (offered as now, the child's parents from the tree) or _New …_ with a name and, for a child, a sex; a parent's sex comes from the Role. At least one person named is in the tree already, else Save is refused ("Name someone in the tree"), so the tree stays one piece. A new child goes into the named parents' family (a new family when they're not a couple yet), new parents with them; new spouses start a family; existing spouses who are already a couple are that family.
- **Edit** opens the same card, its fields as saved. Entries made before ADR-0033 show them empty.

## Saving: the Entry against the tree

Nothing the Entry would do to a Fact is required (Heikki, 2026-11-17). Under the fields the card lists it, one line and one box each, kept up to date as the fields and people change. For each filled field, against the Fact of that kind of its owner (the child, the family, the person):

- **None:** _Add Birth 3.3.1761 at Mäkelä, Esimerkkilä_, ticked. Added from the Entry's date and place, and the Citation supports it.
- **Agrees:** _Supports Christening_, ticked. A date agrees when the Entry's falls within the Fact's (the Fact's 1761, `ABT 1761` or `BET 1760 AND 1762` against 3.3.1761); a place agrees when it's the same, or the Fact has none.
- **Says less or differs:** _Change Birth 1762 → 3.3.1761_ (a year only made exact, a place filled or another one), unticked. Ticked, the Fact is made the Entry's and supported; left, it isn't supported, the Entry keeps its own, and the tree-quality check 4 lists a difference.
- **Two or more** Facts of the kind: no line ("Two Births: choose in _Sources_").
- **A Residence** agrees when it's at the same place with overlapping years; else _Add Residence 1790–1796 at …_, ticked.

With nothing ticked, Save saves the Entry, its dates and people only. A person or family the Roles make (`03`) isn't one of these: naming someone new is asked for by _New …_.

The Entry, its people, their families and the ticked Facts and support are saved in one request and one transaction (the Entry's edit, ADR-0026); one part refused refuses all of it. Each piece is a Change.

Emptying a field on Edit takes nothing back: the Fact and its support stay, as the tree's.

## What goes

- `entryFact` and support at making (ADR-0022): support comes only from the fields above, or from _Sources_.
- On the Role-less card, _People on this line_ with _Add person…_: one person's row instead.
- Entries tickets 07 (a left-out parent on the source row) and 08 (a list of baptisms missing a parent): the tree-quality check 11 says it, in one place (`.scratch/tree-quality/spec.md`).

## Not now

- A household as one Entry with household Roles (isäntä, emäntä, renki).
- More names per person, the book's spelling as a name (Later list).
- Reading dates from old Transcriptions (tried and removed, 174d0d0).

## Tickets

1. `01-entry-kind-on-the-card.md`
2. `02-baptism-dates-make-facts.md`
3. `03-new-people-from-roles.md`
4. `04-marriage-entry.md`
5. `05-burial-entry.md`
6. `06-household-line-residence.md`
