# A place holds the village and farm

MyHeritage writes a residence's whereabouts as its `ADDR` with no `PLAC`, a church book's chain "farm, village, parish, province, country". The tree's other Facts name their place in `PLAC`, so a residence and a baptism on the same farm were in different fields.

GEDCOM 7 says which is which. `PLAC` is a list of jurisdictions from the lowest to the highest, which may go down to "a specific building, farm, or cemetery". `ADDR`'s payload is the address "as it would appear on a mailing label". Finnish guides write the village and farm into the place too (HuMo-gen's _Sukututkimustavan linjaaminen_), though parish first. Heikki chose GEDCOM's way: the whole chain is the place, and an address is a mailing address.

- **The import reads a file as it's written.** An `ADDR` stays an address, whatever it holds; the app doesn't guess what a file meant (Heikki decided this after first having the import move it).
- **Heikki's datasets are converted by a script,** `scripts/tidy-places`, not a migration: it's his trees' data, not a rule for every dataset. A Fact's address standing alone becomes its place, unless it reads as a mailing address, one with a postal code ("00100", "97008-7922"); its `ADDR` goes. One Change on nothing says how many Facts it was. It's run again after importing a MyHeritage export.
- **The form's _Address_ field is for a mailing address,** and its hint says so. The _Place_ field grows to the chain's lines and suggests the dataset's places as one types.
- **An address edited in the app is written as `ADDR` whole**, its parts from an import gone, as GEDCOM 7 takes the payload over the parts.

## Considered options

- **The parish in the place, the village and farm in the address.** Rejected: no source says so, GEDCOM's `ADDR` is a mailing address, and other programs would read the village as a street.
- **The import moves an address standing alone to the place.** Done first, then rejected: the import would rewrite what a file says by a guess.
- **A migration (schema 6).** Done first, then rejected: one tree's conversion doesn't belong in every dataset's schema. The datasets that had run it were set back to schema 5; their data was already converted.
- **Tell a mailing address by a house number too.** Rejected: farms are numbered ("No. 16"), so a number says nothing.

## Consequences

- No schema change.
- The Change kind `addresses-to-places` is the script's.
