# A Citation supports Facts

Every Citation in ylonen is on its person, and none says which of the tree's Facts it is evidence for. Since ADR-0021 the Facts are edited in the app, so a Fact should show what it rests on, and disagreeing sources should show side by side. The earlier plan (`.scratch/citation-practices/fact-citations.md`, option A) moved an app-made Citation _onto_ the Fact its Entry is about. Heikki (2026-11-13) agreed to do it as the end model has it instead.

So a Citation and what it supports are two things:

- **A Citation stays on its person** (or family): _this person is in this Entry, in this Role_. Everything that reads a person's Citations (_Sources_, the Scan viewer's People, Mark, Discard, Church books counts, delete) is unchanged.
- **Support is its own row**, `fact_citations(fact_id, citation_id)`: _this Citation supports this Fact_. One Citation may support several Facts (a rippikirja line gives the birth, the residence and the marriage), and one Fact may rest on several Citations.
- **A Citation supports only its owner's Facts:** its person's, the Facts of the families where that person is a spouse, or a family Citation its family's. A spouse leaving the family takes their Citations' support of its Facts with them. Deleting a Fact or a Citation deletes its support.
- **Nothing writes a Citation on a Fact any more.** Schema 5 moves each one to the Fact's owner, after its owner's others, with a support row; one identical to a Citation its owner already has (source, page, text, date, Event, Role, quality, and nothing of its own held) becomes that one's support instead. `scope_type = 'fact'` stays in the CHECK until the next rebuild of `citations`.
- **GEDCOM repeats it.** GEDCOM has no support record; it writes the `SOUR` again under each Fact it supports. The export writes every Citation under its owner as now, and under each Fact it supports a copy: source, `PAGE`, `DATA`, `EVEN`/`ROLE`, `QUAY`, without the Annotation, notes or media. The import folds a Fact's `SOUR` back into support of its owner's identical `SOUR`, read as written; one with no twin becomes a Citation of the owner and supports the Fact, as the migration does. Other programs read ordinary GEDCOM.
- **Making a Citation in the Scan viewer supports the Fact its Entry plainly records:** a baptism's child, their one Christening, else their one Birth; a marriage's spouse, their one marriage. Anything else (a parent, a godparent, a household line, two such Facts) supports nothing until it's chosen in _Sources_.
- **Each support added or taken back is a Change** on the Citation, naming the Fact as it read.

## Considered options

- **Move the Citation onto the Fact** (option A). Rejected: one Entry supports several Facts, and every query of a person's Citations would have to climb from the Fact.
- **A copy of the Citation under each Fact** (option B, GEDCOM's own shape). Rejected: Mark, Discard, delete and the lists would have to group the copies into one again.
- **The Entry table first** (`.scratch/citation-practices/entries.md`). Deferred: it rewrites `citations/myheritage/`, which goes once the unmarked references are Marked (ADR-0021). When it comes, a Citation becomes a person's reference to an Entry, and support stays as it is: it goes through the person's Citation, because one baptism supports the child's birth but only the father's residence.

## Consequences

- Schema 5; datasets migrate as they open.
- `CitationRow.supports` lists the Fact ids a Citation supports; the panel finds a Fact's sources from its person's Citations.
- `facts.remove` no longer moves Citations; their support goes with the Fact.
