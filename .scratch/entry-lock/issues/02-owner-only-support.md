Status: needs-triage

# An Entry's Citation supports only its owner's Facts

ADR-0037. `createSupport().set` (`citations/support.ts`) refuses support by a Citation of an Entry unless the Citation is its owner's and the Fact the owner's (a marriage's: the family's, by either spouse's Citation). Every caller goes through it: the Entry pane's ticks, the assistant's `support_fact` and `add_fact`'s `citationIds`, and the GEDCOM import's folding of a Fact's `SOUR` (an Entry's Citation that would support another's Fact there is left unsupported, and the import says nothing).

The assistant's `support_fact` description says so, so it doesn't propose what will be refused.
