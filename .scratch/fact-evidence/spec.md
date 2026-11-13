Status: done

# Citations as evidence for Facts

Glossary: **Citation**, **Fact**, **Entry**, **Event**, **Role** (`src/server/citations/GLOSSARY.md`). Decisions: ADR-0022 (a Citation supports Facts), ADR-0021 (Sukulinja is the tree's master copy), ADR-0016 (conversion). Earlier studies: `.scratch/citation-practices/fact-citations.md` (options A–D), `.scratch/citation-practices/entries.md` (an Entry table).

Heikki, 2026-11-13: "Miten faktat liittyvät sitaatteihin? Onko siellä jokin kytkös nyt?" and then "Okei, jatka tätä eteenpäin. Tämähän on melko tärkeä asia."

## Decided by Heikki, 2026-11-13

"Selvä homma. Jatka niin kuin ehdotit." A Citation supports Facts (below), not option A, and not the Entry table first. It's the end model's support, so the Entry table later leaves it as it is (ADR-0022).

## Where it is now

- Every Citation in ylonen (3 835) is on its person; no Fact has one. The panel's _Sources_ lists the person's Citations, _Events_ lists Facts with no sources.
- The schema and the GEDCOM import and export already allow a Citation on a Fact (`scope_type = 'fact'`; the Bourbon demo has four), but nothing in the app shows or makes one: `citations.ts` reads `scope_type = 'person'` only and `app-citations.ts` makes person Citations only.
- An app-made Citation knows its Entry's **Event** (from the Book) and the person's **Role** (EVEN/ROLE), but not which Fact it supports.
- Deleting a Fact moves its Citations up to its person or family.

## The problem with the earlier plan (option A)

Option A put an app-made Citation _on_ the Fact its Entry is about. It was chosen while MyHeritage owned the tree. Since ADR-0021 Facts are edited in the app, and A's limits now matter:

- **One Entry supports several Facts.** A rippikirja line gives the birth date, the residence and often the marriage and death. A puts it under one.
- **A Citation on a Fact is no longer the person's.** Everything that asks "this person's Citations" (_Sources_, the Scan viewer's People, Mark, Discard, Church books counts, delete, Changes) would have to climb from Fact to person. That's a refactor through `citations/` for a model that still can't hold the rippikirja line.

## Proposal: a Citation supports Facts

Two things, kept apart:

- **The Citation** stays where it is: on its person (or family). It says _this person is in this Entry, in this Role_. Nothing that reads a person's Citations changes.
- **Support** is new: _this Citation supports this Fact_. One Citation can support several Facts; one Fact can be supported by several Citations, and then disagreeing sources show side by side.

```
fact_citations
  fact_id      → facts     ON DELETE CASCADE
  citation_id  → citations ON DELETE CASCADE
  PRIMARY KEY (fact_id, citation_id)
```

- **A Citation supports only its owner's Facts:** its person's, or for a family Fact (marriage, divorce), the family's or one of its spouses'. The server refuses others.
- **Schema 5 migration:** each Citation on a Fact today moves to the Fact's owner (as deleting a Fact already does) and gets a support row for that Fact. Afterwards `scope_type = 'fact'` isn't written; the CHECK keeps it for old files until a later schema drops it.
- **Deleting a Fact** drops its support rows; its Citations stay on the person, as today.
- **Deleting a Citation** drops its support rows.

### In the panel

- **_Events_:** a Fact supported by Citations lists them under its text, by the name _Sources_ gives them and where in their Volume; picking one unfolds it in _Sources_ and scrolls to it. An unsupported Fact shows nothing, so the eye finds the Facts that still need a source.
- **_Sources_:** each Citation's details show _Supports_: the Facts it supports, and the person's other Facts to add, as toggles. Each toggle is a **Change** on the person (_Birth 3.3.1761 cited from Haukivuori kastetut 1750–1770_), so it can be found and undone by hand.
- **Fact form:** unchanged. Support is set from the source, where the evidence is read.

### When a Citation is made in the Scan viewer

"New citation for…" already knows the Entry's Event and asks the Role. The server then supports the Fact the Entry plainly records: a baptism's child → their one Christening, else their one Birth; a marriage's spouse → their one marriage. Anything else (a parent, a godparent, rippikirja and lastenkirja lines, two such Facts, none) supports nothing. The form doesn't change: the support shows in _Sources_ and _Events_, where it can be taken back, and is a Change like any other.

### GEDCOM

GEDCOM has no "support" record; it repeats the `SOUR` under each Fact it supports. So:

- **Export:** every Citation is written under its owner, as now, with its Annotation; under each Fact it supports, a copy with the same source, `PAGE`, `EVEN`/`ROLE` and `DATA`, but no Annotation.
- **Import:** a `SOUR` under a Fact that equals one under the Fact's owner (or a spouse, for a family Fact) by source, page and text becomes a support row of that Citation. One with no such twin becomes a Citation of the owner plus a support row, as the migration does. The round trip test (ADR-0013) checks it comes back the same.
- Other programs see ordinary GEDCOM: the same citation under the person and under each Fact.

### Why not the Entry table now

`entries.md` would make an Entry its own row, cited by many people. It's the right model for sharing a Box and a Transcription between the people of one baptism, but it rewrites `citations/myheritage/`, which goes once the ~3 200 unmarked references are Marked (ADR-0021). Support doesn't depend on it: when Entries come, a Citation becomes "a person's reference to an Entry", and `fact_citations` stays as it is. So this isn't throwaway work.

## Not in this feature

- **Suggesting support for the 3 835 existing Citations** from their Transcriptions (dates and places matching a Fact). Useful, but a feature of its own once support exists; until then, support is added by hand in _Sources_.
- **The placeless RESI Facts** (2 313 in ylonen, copies of rippikirja Citations). Deleting them or showing a residence timeline from the Citations is its own decision (ADR-0021, `fact-citations.md` question 2).
- **Godparents:** a godparent's Citation supports none of their Facts by default; they can add one by hand.
- **The Entry table** (above).

## Structure

- **Server:** `src/server/citations/support.ts` reads and writes `fact_citations` and checks ownership; the routes go in `citation-routes.ts` (`PUT`/`DELETE …/citations/:id/supports/:factId`). `CitationRow` gains `supports: number[]` (Fact ids), read with the row; the panel finds a Fact's sources from it, so it's said once.
- **Changes:** a new `ChangeWhat` kind `support` (`did: add | remove`), on the Citation, carrying the Fact's tag and words as they read, like `fact`.
- **Client:** `sources.ts`'s details get a `supports.ts` sub-component; `events.ts` shows the count and list. `citations.cite` supports the Fact its Entry records, by a pure rule in `support.ts`.
- **Export/import:** `export/gedcom.ts` `citations()` adds the copies under Facts; `import/facts.ts` folds them back, in one helper beside `importCitations`.

## Tickets

All done 2026-11-13, in one go.

| #   | Ticket                                                                       | Blocked by |
| --- | ---------------------------------------------------------------------------- | ---------- |
| 01  | Schema 5: `fact_citations`, Fact Citations moved to their owner (ADR-0022)   | none       |
| 02  | Server: support a Fact with a Citation, its Change; rows carry it            | 01         |
| 03  | Export the copies under Facts, import folds them back, round trip            | 01         |
| 04  | _Sources_: _Supports_ toggles in a Citation's details                        | 02         |
| 05  | _Events_: a Fact's sources, picking one shows it                             | 02         |
| 06  | Scan viewer: a new Citation supports the Fact its Entry records              | 02         |
| 07  | Glossary: **Support**; **Citation** and **Fact** reworded; `entries.md` note | 01         |

## Open questions for Heikki

1. ~~The model~~: support (Heikki, 2026-11-13).
2. ~~"N sources" or the sources listed?~~ Built listed: each Fact's sources show under it by name, as few Facts have more than one or two; picking one unfolds it in _Sources_.
