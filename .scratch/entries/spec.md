Status: done

# One Box per Entry

Glossary: **Entry**, **Citation**, **Role**, **Transcription**, **Box**, **Support** (`src/server/citations/GLOSSARY.md`). Decision: ADR-0026 (draft). Builds on ADR-0016 (conversion), ADR-0022 (support). Earlier: `.scratch/citation-practices/entries.md`, `.scratch/citation-practices/citation-reuse.md`.

Heikki, 2026-11-13: one baptism entry should be one Box, not one per person, and the Scan viewer's foot bar holds too much.

## Where it is now

- Each person's Citation holds its own Image, Box and text (`citations.link_*`, `text`). A Mark at the entry writes the same Box into every citation of the record; the Conversion keeps the copies.
- _New citation for…_ makes one Citation for one person: a Box drawn for each, and in the foot bar the person's name, a row of Role buttons with no heading, a text line, Cancel and Save, beside the paging.
- A Citation of a baptism for its child supports their one Christening, else Birth (`entryFact`); a parent's supports nothing.

## The model

As ADR-0026: `entries(id, source_id, volume_id, volume, image, file_id, box_left, box_top, box_width, box_height, event, text)`, and `citations.entry_id`. Only the app's Citations of an Image cite an Entry; a reference keeps `link_*`. `annotations.ts` reads a Citation of an Entry joined to it, so every `CitationRow` reader is unchanged.

## In the Scan viewer

- **One Box per Entry.** The Image's People list each Entry once, its people under it with their Roles.
- **New entry.** Right-click on the Image → _New entry here_ → draw the Box. Beside the Box (not in the foot bar) a small form:
  - in a baptism Volume: _Child_ (the Selected person if they have no Citation here), _Father_ and _Mother_ (offered from the child's parents in the tree, each one click to take out);
  - in a marriage Volume: _Groom_, _Bride_;
  - in a rippikirja or lastenkirja: _People on this line_, no Roles;
  - the Transcription line ("What the entry says").
  - Save makes the Entry and one Citation for each person named; the child's Christening (else Birth) and the spouses' marriage get its support as now.
- **An Entry's Box menu:** _Add person…_ (picked with a Role), _Remove <name>_, _Edit_ (move the Box, retype the Transcription), _Delete entry_ (asks; names how many Citations go).
- **The foot bar** holds only the paging and, while a Box is pending, Cancel and Save.

## GEDCOM

Written as now, each Citation whole under its person. The import makes one Entry of the app's Citations with the same source, Image file, `CROP`, `EVEN` and text. Round-trip test.

## Not in this feature

- References (Marks at the Image or Volume, Matches, Estimates) on Entries: when `citations/myheritage/` goes.
- Each Entry its own GEDCOM `SOUR` (splitting).
- Merging Entries drawn apart before (Heikki, 2026-11-13: not needed): one is deleted and the person added to the other.
- Godparents (Heikki, 2026-11-13: not needed): the form offers no _Godparent_; their names stay in the Transcription. Citations already made as `GODP` read as before.

## Tickets

Done 2026-11-13 (schema 6): the table, the migration and the read through `CITATIONS_READ`; a Conversion and an import make one Entry of the alike (`gatherEntries`); the GEDZIP round trip gives them back.

Done 2026-11-13: `citeEntry` and `addToEntry` (POST `/api/entries`, `/api/entries/:id/people`); a person is removed with DELETE `/api/citations/:id`, the last taking the Entry. `CitationRow.entryId`, and `markKey` `entry <id>` for one Box.

Done 2026-11-13: the Scan viewer names a new entry's people in a card beside its Box ("New baptism"), the foot bar only Cancel and Save.

Done 2026-11-13: the Box's menu is _Edit_ and _Delete entry_. _Edit_ opens the same card on the Entry as it is: people, words and Box changed with one Save (PUT and DELETE `/api/entries/:id`). In a baptism, once its child or a parent is named, the other Roles offer only whom the tree says, or one made anew there; no search.
