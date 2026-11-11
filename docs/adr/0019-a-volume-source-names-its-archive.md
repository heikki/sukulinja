# A Volume's source names its archive, and a Citation of an Image reads as one

A Citation made in the app cites its Volume's source, titled with the Volume's label alone ("I Aa:5 Pää- ja rippikirjat (1790-1796)"), and its `PAGE` is the Image's address in Astia. Two problems follow:

- **Parishes share labels.** The source is found by the Volume's xref or, failing it, by title and publisher (ADR-0016). So the first Citation in another parish's Volume of the same label cites the first parish's source. Seen 2026-11-11 with two Volumes `juva-5` and `mikkeli-5`; no dataset has such a pair yet.
- **An address alone doesn't lead back to the book.** A **Re-scan** changes every file id in it, Astia has changed its paths before, and another program or a printout shows a string of numbers. A citation of an archive's book names the archive, the book and the page, as the National Archives and _Evidence Explained_ both have it (`.scratch/citation-practices/idea.md`).

The Astia address stays the source of truth: the Link a Mark stores, and the Citation's `page`. What changes is how the source is named and how a Citation is written out:

- **A Volume's source is titled with its archive first**: "Juvan seurakunnan arkisto, I Aa:5 Pää- ja rippikirjat (1790-1796)", the archive's title as Astia gives it. Title and publisher then tell one Volume's source from another's, as ADR-0016 means them to. Making a Citation already finds the Volume's archive, for the Link it gives back.
- **The sources already made are retitled by a one-off script**, as the conversion's was (ADR-0016): finding a Volume's archive asks Astia, which a migration (ADR-0018) can't. Until it's run, a dataset has both namings.
- **The export writes a Citation of an Image's `PAGE` as text, its address last**: "Juvan seurakunnan arkisto, I Aa:5 Pää- ja rippikirjat (1790-1796), s. 123. Kansallisarkisto, Astia, kuva 45. https://astia.narc.fi/…". The page is left out where the Citation doesn't know it. The text is made from what the Citation holds, its source, its Link and its original page, and never stored. The GEDZIP and the 5.5.1 file both write it.
- **The import reads `page` back from the Link**, the Image's address made from its Volume and file id, as a Mark sets it, not from the text. A round trip gives back the same `page`.

## Considered options

- **Keep `PAGE` the address, and put the text in a `NOTE`.** Rejected: `PAGE` is where every program looks for where in a source a citation is.
- **Store the text in `page`.** Rejected: `page` would then be both what the merge pairs by and what a person reads, and the text would have to be rewritten whenever a Link moves.
- **Find the source by xref only.** Rejected: a source brought back under another xref would get a second copy, and the label still wouldn't name the parish.
- **Retitle the sources in a migration.** Rejected: a migration runs as the database opens, without Astia.

## Consequences

- `create` and `convert` in `app-citations.ts` take the Volume's archive title.
- The panel shows a Volume's source by its new title, as any source.
- The round-trip test covers a Citation of an Image with the text in `PAGE`.
