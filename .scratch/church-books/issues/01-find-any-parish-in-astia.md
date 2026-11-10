Status: needs-triage

# Find any parish's church books in Astia

Glossary: **Church books**, **Volume**, **Book**.

The Church books view lists only the parishes whose Astia archive was looked up by hand (`PARISHES` in `src/server/citations/astia/archives.ts`, 14 today). Browsing the books of any other parish, or starting a tree with no references at all (its first Citation made from the scans, as one is made from a listed Volume), needs the app to find a parish's archive ("… seurakunnan arkisto") in Astia itself.

## Open questions

- What Astia offers for this: a search by name, or a list of the parish archives under some unit. Parish archives are top-level in Astia, which is why they were looked up by hand.
- Whether a parish found this way is kept for the install beside `PARISHES` (the data folder, like `pins.local.json`), and whether it then also serves resolving references in that parish.
- Spellings: MyHeritage and FamilySearch spell some parishes otherwise (Pieksamaki, Mikkeli Maaseurakunta); a parish found by search may need its spellings added by hand.

Raised by Heikki on 2026-11-09 while trying the Church books view.
