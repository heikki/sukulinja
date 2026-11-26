Status: accepted (2026-11-26)

# An Entry's kind and owner stay as saved

Support is a Citation's (ADR-0022), but the Entry pane lists only the Facts of the Entry's owner: a baptism's child, a marriage's couple's family, a burial's or household line's one person (ADR-0033). An architecture review (Heikki, 2026-11-26) found support the pane can't show or take back: a child made the father keeps the support of their own Birth (ADR-0026: "a Role changed keeps the person's Citation"), a baptism made a marriage leaves the child's Facts supported, and the assistant's `support_fact` takes any of the person's Citations. Editing a marriage also made its couple a family again whenever they weren't one, so a couple unlinked in the tree came back with a ticked _Add Marriage_.

- **A saved Entry's kind and owner don't change.** In _Edit entry_ they show as text with a _Change…_ link. Changing either saves a new Entry, with the same Box and Transcription, and removes the old one in the same transaction; its lines are worked out as for a new Entry, and the old owner's Facts it supported are listed as _no longer its source_. So the owner's Citation of an Entry is always the one it was made with.
- **An empty kind is chosen once, and an empty owner Role filled.** Entries made before ADR-0033, and those imported from a GEDCOM citation with no `EVEN`, have no kind; a marriage may name its groom alone. Choosing or filling one is an edit, not a new Entry; then it stays.
- **Everything else is edited as now:** the Box, the Transcription, the dates and place, the ticks, and anyone who isn't the owner, in any of their Roles.
- **An Entry's Citation supports only its owner's Facts,** whoever sets it: the Entry pane, the assistant, the import. `support.ts` checks it once for all of them. Other Citations support their owner's Facts as before.
- **Editing makes no family.** Only making an Entry makes a marriage's couple a family.
- **The tree may change under an Entry, and neither is put right by the app.** The Entry says what the book says and whom Heikki took it to name; the tree is the conclusion. A couple unlinked, or a child moved to other parents, doesn't say which of the Entry's people was taken wrongly. The Entry pane says so above its lines ("Matti and Kaisa aren't a couple in the tree"), by the same rule as the tree-quality check "An Entry names the people the tree gives it", and offers no _Add Marriage_ for a couple who aren't a family. Heikki puts it right in the pane: another person in the Role, or the Role left empty.
- **A save checks the tree hasn't changed since its lines were listed,** by the last Change then, rather than by the lines the pane sends.

## Considered options

- **The pane lists every support of every Citation of the Entry**, and a Role, kind or owner changed lists the old support to take back (option A of the review). Rejected for now: every change of owner becomes a case to handle. It's the fallback if the lock proves too stiff.
- **Support on the Entry**, `entry_facts(entry_id, fact_id)`, `fact_citations` kept for other sources (option B). Rejected: a migration, two support tables and the GEDCOM round trip to adapt, for what the lock gives.
- **Support worked out from the Entry's dates** (option C), none stored. Rejected: a fuzzy match, no _Keep as source_ for a Fact that differs, and Entries with no dates supporting nothing.
- **Keep the assistant off Entries' Citations.** Rejected (Heikki): it couldn't support a Fact from a baptism; the owner-only rule keeps what it does visible in the pane.
- **Ask, when the tree changes, whom to take out of the Entry.** Rejected: unlinking a couple doesn't tell which of the two was taken wrongly.

## Consequences

- Amends ADR-0026 (a Role changed keeps the person's Citation: not the owner's) and ADR-0033 (the kind chosen on the pane: once).
- Support made before by a Role or kind changed is taken back by a one-off script, if any is found.
- Two Facts of a kind (only an import brings them) become a tree-quality check rather than a line pointing to _Sources_.
- A hand way to set the support of Citations that aren't of an Entry waits until it's needed; the assistant does it meanwhile.
