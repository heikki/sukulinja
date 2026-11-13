# A place holds the village and farm

MyHeritage writes a residence's whereabouts as its `ADDR` with no `PLAC`: in ylonen 2,311 of 2,347 residences read "farm, village, parish, province, country", e.g. "Laukola, Haukivuori, Haukivuori, Mikkeli (St. Michel), Finland". The rest of the tree's Facts name their place in `PLAC`. With an _Address_ field in the Fact form, a residence's whereabouts were in one field and every other Fact's in the other.

GEDCOM 7 says which is which. `PLAC` is "a List of jurisdictional entities in a sequence from the lowest to the highest jurisdiction", which "may include units of any size, such as a continent, "at sea", or a specific building, farm, or cemetery". `ADDR`'s payload is "the full formatted address as it would appear on a mailing label". Finnish guides write the village and farm into the place too (HuMo-gen's _Sukututkimustavan linjaaminen_: "Seurakunnan lisäksi alueen, talon ja torpan nimi"), though parish first. Heikki chose (2026-11-13) GEDCOM's way: the whole chain is the place.

- **An address standing alone is the place,** unless it reads as a mailing address: one with a postal code ("00100", "97008-7922"). `facts/address-place.ts` says so, for the import and the migration both.
- **The import keeps such an `ADDR` as the `PLAC`,** and not its parts. One beside a `PLAC`, or with a postal code, stays an address with its parts.
- **Schema 6 converts a dataset** (ADR-0018): each such Fact's address becomes its place and its address row goes. One Change on nothing says how many Facts it was. The records' `CHAN` stays, as nothing the Fact says changed.
- **The chain is kept as written,** lowest first as GEDCOM and MyHeritage have it, its names unchanged ("Mikkeli (St. Michel)", "Haukiwuori"). Making the names one is its own work.

## Considered options

- **The parish in the place, the village and farm in the address.** Rejected: no source says so, GEDCOM's `ADDR` is a mailing address, and other programs would read the village as a street.
- **Leave it as MyHeritage wrote it.** Rejected: a residence and a birth in the same farm would be in different fields.
- **Tell a mailing address by a house number too.** Rejected: farms are numbered ("No. 16, Kyrkoby"), so a number says nothing; a census line like "Same House - 7125 Newell, Portland, …" becomes a place.

## Consequences

- Schema 6; datasets migrate as they open.
- The form's _Address_ field is for a mailing address; its hint says so.
