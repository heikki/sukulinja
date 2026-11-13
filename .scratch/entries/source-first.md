Status: needs-triage

# Source first: from a found entry to the tree

So far the work has gone tree first: the tree came from MyHeritage with its Facts and citations, and the app turned those citations into its own and tied them to the Facts they back up (ADR-0016, ADR-0022).

A tree started in the app goes the other way. Research starts in the church books: an entry is found, and the tree is built from what it says. The Entry (ADR-0026) is where that starts.

Questions to settle before tickets:

- What the Entry card records beyond its people: dates (born, baptised), places, maybe the farm. See `issues/09-dates-in-baptism-card.md`.
- What saving makes in the tree from it: Facts for the child (Birth, Christening) supported by the Entry; a new person, or a new child of the named parents, when they aren't in the tree yet.
- When a date or place differs from what the tree has: ask, keep both, or only cite.
- Whether the same flow fits a marriage (Marriage Fact for the couple) and a household line in a rippikirja (Residence).
- How this sits with the tree-first path (Facts edited in Events, sources chosen from Marked ones) so there's one way, not two.

Background: GEDCOM X and Gramps keep this apart as evidence (what the record says) and conclusions (what the tree holds); see `../citation-practices/citation-reuse.md`.
