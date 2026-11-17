Status: ready-for-agent

Blocked by: 01

# A baptism's dates and place make the child's Facts

Spec: `../spec.md` (The card: Fields; Saving). ADR-0033. Replaces Entries ticket 09.

The Entry keeps _Born_, _Baptised_, village and farm (schema change). Saving compares each against the child's Birth and Christening: adds the missing one, supports the agreeing one (sharpening one that says less), asks once about those that differ, leaves two of a kind alone. `entryFact` and support at making go. One request, one transaction, a Change for each piece. GEDCOM: the date in the citation's `DATA` `DATE`, read back on import.

Done when: the four cases (none, agrees, differs kept or changed, two) are tested on the server, the round trip keeps the dates, and `bun dev` in dark mode with screenshots of the card and the question.
