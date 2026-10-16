Status: needs-triage

# Write MyHeritage record dates the way facts are written

Fact dates now read the Finnish way (`15.5.1867`, `1867–1879`, `n. 1850`) via
`gedcomDate` in `src/common/dates.ts`. MyHeritage record fields in the person
panel still show dates as MyHeritage wrote them (`15. Touko 1867`), so the same
date can appear both ways in one panel.

Not decided: whether to do this at all. Revisit after living with the fact
formatting for a while.

## What it would take

Convert while the record fields are built for the panel (`readRecord` in
`src/server/citation-scans/record.ts`); the stored citation text stays as
recorded. The record module's Finnish month parser (`isoDate`, used for scan
matching) already turns "29. Marras 1829" into `1829-11-29`; feed that to
`isoDate` in `src/common/dates.ts`. Rename one of the two `isoDate`s.

Shapes seen across ylonen and bourbon:

- Household Birth column (~10k): a bare date — `1867`, `15. Touko 1867`,
  `15. toukokuuta 1867`.
- Syntymäpäivä / Syntymä / Syntymäaika / Kuolema (~3.8k): almost all a bare
  date.
- Ristiäiset / Avioliitto / some Syntymä (~1.1k): a date, then a place —
  `15. Touko 1867 - Haukivuori, …`. Rewrite only the leading date.
- Asuinpaikka: `päivämäärien 1867 ja 1879 välissä - Haukivuori, …`.
  Optionally `1867–1879 - …`, matching the residence facts.

Anything else stays as written.
