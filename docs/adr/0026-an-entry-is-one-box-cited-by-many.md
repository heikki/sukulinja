Status: proposed (draft, 2026-11-13)

# An Entry is one Box, cited by everyone it names

A baptism names the child, the parents and the godparents, but the app keeps no **Entry** of its own: each person's Citation holds the Image, the Box and the text. A Mark writes the same Box into every citation of the record, and the Scan viewer's _New citation for…_ makes each person draw the entry again, with its Role picked from a row of buttons in the foot bar. Heikki (2026-11-13) found both wrong: one entry should be one Box. This is the plan of `.scratch/citation-practices/entries.md`, taken now for the app's own Citations only, with the GEDCOM findings of `.scratch/citation-practices/citation-reuse.md`.

- **An Entry has a row of its own**, `entries`: the Volume's source, the Volume, the Image and its file id, the **Box**, the **Event** its Book records, and its **Transcription**. One row, however many cite it.
- **A Citation of an Entry is a person's reference to it:** `citations.entry_id`, with what is the person's own: their **Role**, quality, date, notes, the original page and the sort order. Its `source_id`, `page`, `event`, `text` and `link_*` are left empty; reading it fills them from the Entry, so a `CitationRow` reads as it does now.
- **Only the app's Citations of an Image cite an Entry:** those made in the Scan viewer and those converted from a reference (ADR-0016). A Church-book reference, Marked at the Image or the Volume, Matched or estimated, keeps its `link_*` columns as now, until `citations/myheritage/` goes. So nothing the folder writes changes; its Conversion makes one Entry for every citation of the record, and its Record pins read converted Citations through the Entry.
- **The Entry is changed once for all of them:** moving its Box, retyping its Transcription or switching it to a new filming. Removing a person removes their Citation, with its support; removing the last removes the Entry. _Delete entry_ removes all of them.
- **An Entry is edited as a whole, all or nothing:** its Box, its Transcription and who it names in which Role, in one go. It's checked as it would be after: its Book's Roles, no one named twice, no one it names with another Citation linking its Image, and its Box citable there. One part refused refuses all of it, and one naming no one is refused; _Delete entry_ is the way to remove it. Retyping its Transcription from _Sources_, naming someone from its Box's menu and deleting a person's Citation of it from _Sources_ are edits of the Entry too.
- **Moving an Entry's Box isn't a Mark:** a Mark places a Church-book reference, and none cites an Entry.
- **A Role changed keeps the person's Citation**, with its quality, notes and support; the support the new Role plainly gives is added, and none is taken back.
- **Support stays the Citation's** (ADR-0022): a baptism supports the child's Christening, else Birth, never the parents'. `entryFact` reads the Event from the Entry and the Role from the Citation.
- **Making an Entry names everyone in it at once:** the Box is drawn once, and beside it the people are picked by Role, the child's parents offered from the tree. A person is added to an Entry later from its Box's menu.
- **Each Citation made, removed or moved is a Change** on it, as now; a Box moved or a Transcription retyped is one on each of its Citations, and a Role changed one on that person's.
- **GEDCOM stays as it is** (lumping): the Volume is the source, and each Citation of an Entry is written whole under its person, with `PAGE`, `DATA`/`TEXT`, `EVEN`, `ROLE`, `OBJE` + `CROP`. The import makes one Entry of the app's Citations with the same source, Image file, `CROP`, `EVEN` and text. Other programs read ordinary GEDCOM, and the round trip (ADR-0013) gives the same Entries back.
- **The migration** makes one Entry of the app's Citations of an Image with the same source, Image file and Event whose Boxes mostly overlap (60 %): Marked by hand or converted, never a Match nobody confirmed, whose Box is the vision pass's. The first keeps its Box and words; a Citation whose words differ keeps its own, as a converted reference's name its person (schema 7). No action merges Entries later: one is deleted and its person added to the other.

## Considered options

- **Wait until `citations/myheritage/` goes**, as `entries.md` recommended. Rejected: Citations made now, while the references are being Marked, would each be drawn again. Leaving the references out of Entries keeps the folder as it is.
- **Every reference in an Entry, now.** Rejected: Mark, Match, Discard and the vision pass would be rewritten onto Entries in code that is going.
- **Each Entry its own GEDCOM `SOUR` record** (splitting), its Transcription the source's `TEXT`, Citations mere pointers. Not now: thousands of sources in other programs' lists, and GEDCOM 7.1 may bring a citation record (FamilySearch/GEDCOM #348). The export can switch later without changing the model.
- **Merge only identical Boxes and words** (schema 6). Dropped: converted references name their person in their words, so a baptism's Citations stayed apart. Two entries side by side overlap far less than 60 %.
- **Clearer Role buttons only.** Rejected: the Box would still be drawn once per person.
- **Edit an Entry part by part:** a Mark of one of its Citations to move the Box, then its words, then each person named or taken out, a request each. Rejected: one refused part leaves the Entry half edited.
- **A Role changed as its Citation removed and one made anew.** Rejected: the person's quality, notes and support would go with it.

## Consequences

- A schema change; datasets migrate as they open (ADR-0018).
- `annotations.ts` stays the one place that knows where an Annotation is stored; it reads a Citation of an Entry through the join.
- One `citations/entries/` module makes, edits and removes an Entry with its Citations, each in one transaction, and writes their Changes; the Scan viewer saves an edited Entry in one request, by its Entry id.
- The Scan viewer shows one Box per Entry, and its foot bar holds only the paging and, while a Box is pending, Cancel and Save.
- When `citations/myheritage/` goes, the `link_*` columns, `link_by = 'vision'` and `rejections` go in one schema change, as ADR-0016 says, leaving the Entry the only place a Box is kept.
