# What a converted reference said of where it is goes on its Entry

Amends ADR-0013, ADR-0016 and ADR-0019.

A hand Mark on an Image set a reference's `page` to the Image's address and kept the MyHeritage URL beside it as `original_page`. A converted Citation kept that URL so the panel could read its reference again for a short label ("p. 12", or an index's date) and so it stayed a **Record pin**. A GEDZIP carried it as `NOTE Original page:`, which only Sukulinja reads. Heikki (2026-11-26): drop `original_page` altogether, and keep the label's facts with the Entry, in fields other programs understand.

So schema 17:

- **A Conversion writes where the reference said the entry is on its Entry**: a rippikirja's page number in the new `entries.book_page`, and an index's date of its baptism or marriage in the Entry's own date (ADR-0033) where it says none; a birth's date alone isn't the Event's. The step reads both once from the converted text ("Sivu: 12", "Ristiäiset: 29. Marras 1829 - …").
- **The panel's short label** for a Citation of an Image is its Entry's page number, else its Event's date.
- **The export writes the page number in `PAGE`** ("…(1859-1868), s. 12. Kansallisarkisto, Astia, kuva 25. https://…", as ADR-0019 planned), and the import reads it back. The date is the citation's `DATA DATE`, as before.
- **A hand Mark leaves the page alone.** A reference's `page` is always its own; its Link holds the Image, which the export writes as its `OBJE`. A Conversion sets the page to the Image's address. The step gives a reference its page back where a Mark had moved it aside.
- **A converted Citation is no Record pin.** The Estimates of its Film's other references lose it as a pin; a Record range or Page pin a Mark saved stays.

## The Entry pane

Heikki (2026-11-26) asked for the page and the text where the Entry is told:

- **The Entry pane has a Page**, saved in `book_page` with its dates and place. It starts from the Image's page numbering (ADR-0032) where there is one, over a record's "Sivu", since the book's own numbering is where the entry is; on a spread, from the half the Box's middle is in, and it follows the Box there until a page is typed. An Entry with a page saved keeps it.
- **It shows the Entry's text**, to read and change. Placing a reference, it starts from the record's transcription, as the Conversion saves it, and a changed one is the Entry's.
- **A farm named in full stays whole** in Place: "No. 15 Haukivuori" in Haukivuori is not "Haukivuori 15". Only a farm that is a number is joined to its village.

## Consequences

- No `NOTE Original page:` in an export. An older GEDZIP's is read as any note, so a hand-marked reference in one comes back citing the Image's address (Heikki: older GEDZIPs needn't be read as before).
- Entries merged into one keep what either said.
- A converted index reference whose Entry had a date of its own keeps that one.
