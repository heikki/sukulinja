Status: accepted (2026-11-17)

# An Entry records what its book says

So far a tree came from MyHeritage with its Facts, and the app tied its Citations to them (ADR-0016, ADR-0022). An **Entry** (ADR-0026) holds only its Box, Event, Transcription and who it names; the child's Birth and Christening are added apart, in _Events_. Heikki (2026-11-17) wants to start a new tree in the app the other way round: research starts in the church books, an Entry is found, and the tree is built from what it says. GEDCOM X and Gramps keep this apart as evidence and conclusion (`.scratch/citation-practices/citation-reuse.md`).

- **An Entry keeps its own dates and place**, as its book writes them: the evidence. A Fact is the tree's conclusion. A baptism has _Born_ and _Baptised_, a marriage _Married_, a burial _Died_ and _Buried_, each with the village and farm; a household line in a rippikirja or lastenkirja has the village and farm, its date the Volume's years. The parish is the Volume's archive, and the place is written as ADR-0023 writes one. Age, cause of death and the rest stay in the Transcription.
- **The Entry's kind is chosen on its card:** baptism, marriage, burial or household line. A Volume may hold several Registers, and its name doesn't say so, so the Book only gives the first guess: the kind of the Entry before it in the Volume, else the Book's. The kind gives the Event (`CHR`, `MARR`, `BURI`, `RESI`) and the Roles.
- **Saving makes the Facts it records, supported by it.** A filled date or place makes the Fact (the child's Birth and Christening, the family's Marriage, the person's Death and Burial, a Residence) where there is none, and supports the one that agrees. One that differs is asked about once: change the Fact to the Entry's, or keep the Fact. Either way the Entry keeps its own, and a kept Fact isn't supported, so the difference shows in the tree-quality check "a source and its Fact agree". The tree never gets two Births side by side.
- **A Residence per household line.** It runs over the Volume's years (`FROM 1790 TO 1796`) at the line's farm; the same farm in the next rippikirja is a new Residence, not the old one lengthened. One with the same place and overlapping years is supported instead.
- **Support follows the fields, not a rule.** ADR-0022's "a Citation made in the Scan viewer supports the Fact its Entry plainly records" goes, with `entryFact`: an empty field supports nothing, and support is otherwise chosen in _Sources_ as before.
- **The card makes the people it names.** A Role with no one in the tree yet takes a new person, their name as the tree writes it (the book's spelling stays in the Transcription): a new child goes into the named parents' family, a new parent with them, a marriage's new spouses start a family. A new child's sex is chosen on the card; a parent's comes from the Role. At least one person the Entry names is in the tree already, so the tree stays one piece (the Cut rule). A new tree starts as now, from its first person, and their baptism is the first Entry.
- **A household line or burial names one person**, with no Role: someone in the tree, or added as a relative first.
- **One way, not two.** What a church book says is entered on the Entry's card in the Scan viewer; _Events_ is for Facts with no church-book Entry and for corrections. A Fact isn't changed from the card but by the question above, and an Entry's dates aren't changed from _Events_.
- **The same in every dataset.** Imported trees get the same card. Entries made before keep no dates until they're edited; no migration copies a Fact's date into an Entry, as that date would be a conclusion, not evidence.
- **GEDCOM** writes the Entry's date in the citation's `DATA` `DATE`, the place in its text; the import reads them back for the app's Citations (ADR-0013's round trip).

## Considered options

- **The card's dates as a shortcut to the Facts only** (no dates on the Entry). Rejected: a source and its Fact couldn't be told to disagree.
- **Keep both when they differ** (a second Birth). Rejected: the tree should say one thing; the Entry already keeps the other.
- **The Entry's kind from the Book's name.** Rejected: books with births, marriages and deaths together aren't named so.
- **A household as one Entry with its people in household Roles.** Later, if wanted: one line, one person is enough to support a Residence.
- **Start a new tree from an Entry** (no first person). Rejected: two ways to start; the first person's baptism does the same.

## Consequences

- A schema change: the Entry's kind and its dates and place; datasets migrate as they open (ADR-0018).
- `entryEvent` (by Volume name) gives only the first guess; `entryFact` and its auto-support go.
- The Role-less card shows one person's row instead of _People on this line_ and _Add person…_.
- `books.ts` gets the burial book (_Kuolleiden ja haudattujen luettelot_).
- Amends ADR-0022 (support at making) and ADR-0026 (what an Entry holds, its Event told by its Book).
