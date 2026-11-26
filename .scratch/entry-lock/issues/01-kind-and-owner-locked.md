Status: done

# Kind and owner locked, a change saving a new Entry

ADR-0037. The owner is the Role `ownerOf` gives (`citations/entries/tree.ts`): a baptism's `CHIL`, a marriage's `HUSB` and `WIFE`, a burial's or household line's one person.

- In _Edit entry_, the kind and the owner show as text with a _Change…_ link; pressed, the dropdown or the person picker opens, with a note: "Changing it saves this as a new entry."
- Saved with either changed: one transaction removes the old Entry with its Citations (their support going with them) and makes a new one with the same Box and Transcription, the people and fields as the pane has them. Its lines are worked out with no `entryId`, as for a new Entry; the Facts the old owner's Citation supported are listed as _no longer its source_, with no box.
- An empty kind is chosen, and an empty owner Role filled (a marriage naming its groom alone), as an ordinary edit; then they lock.
- The server refuses an edit changing a locked kind or owner by any other way (`entries.edit` with `event` or `people`).
- `edit` no longer calls `newcomers.make` for a marriage's couple: only `make` makes them a family. New parents named in a baptism's edit are still made.
- The test "a Role changed keeps the person's Citation" (`entries.test.ts`) keeps its meaning for non-owner Roles only.
