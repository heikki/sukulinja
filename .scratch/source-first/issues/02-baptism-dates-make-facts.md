Status: ready-for-agent

Blocked by: 01

# A baptism's dates and place offer the child's Facts

Spec: `../spec.md` (The card: Fields; Saving). ADR-0033. Replaces Entries ticket 09.

The Entry keeps _Born_, _Baptised_, village and farm (schema change). The card lists what each would do to the child's Birth and Christening, each line with its own box: add (ticked), support (ticked), change one that says less or differs (unticked); none for two of a kind. Only ticked ones are done; nothing ticked saves the Entry alone. `entryFact` and support at making go. One request, one transaction, a Change for each piece. GEDCOM: the date in the citation's `DATA` `DATE`, read back on import.

Done when: the cases (none, agrees, says less, differs; each ticked or not; two) are tested on the server, the round trip keeps the dates, and `bun dev` in dark mode with screenshots of the card and its list.
