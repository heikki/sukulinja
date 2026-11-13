Status: ready-for-agent

# Suggested support for old Citations

Glossary: **Citation**, **Fact**, **Support**, **Transcription**, **Entry**, **Role** (`src/server/citations/GLOSSARY.md`). Decision this builds on: ADR-0022 (a Citation supports Facts). Earlier: `.scratch/fact-evidence/spec.md` ("Not in this feature"), `.scratch/citation-practices/fact-citations.md` option C.

Heikki, 2026-11-13: agreed to suggest support for the existing Citations from their Transcriptions, for him to confirm.

## Where it is now

- ylonen has 3 835 Citations, all on their person, and none supports a Fact. Support is added by hand in _Sources_ (the _Supports_ toggles), or made when a Citation is made in the Scan viewer (`entryFact`).
- Most Citations have a Transcription that names events with dates: "Syntymäpäivä: 15. Touko 1867", "Ristiäiset: 29. Marras 1829 - Mikkeli, …", "Kuolinpäivä: …". A MyHeritage reference keeps it as MyHeritage wrote it (`CitationRow.record` reads it into fields); a converted one as plain `Label: value` lines (ADR-0016); one made in the Scan viewer as typed.

## The rule

A **Suggestion** is a Fact of the Citation's person that the Citation's Transcription gives, and that the Citation doesn't support yet. It's derived each time the person's Citations are read, and nothing of it is stored.

1. **The Transcription's events.** Its fields read as events by label: _Syntymäpäivä_, _Syntymäaika_, _Syntymä_ → Birth; _Ristiäiset_, _Kaste_ → Christening; _Kuolinpäivä_, _Kuolema_ → Death; _Hautaus_ → Burial; _Avioliitto_ → Marriage. The value's date is read as MyHeritage writes it ("15. Touko 1867", "Touko 1867", "1867"); a value with no year gives no event.
2. **Whose events they are.** A household line (rippi- or lastenkirja) is about the person it's cited for, so all its events are theirs. A baptism Entry gives the Birth and Christening only to its child (Role `CHIL`), a marriage Entry the Marriage only to its spouses. A parent's or godparent's Citation, or one whose Role isn't known, gives nothing.
3. **Which Fact.** The person's one Fact of that kind: theirs, or for a Marriage, their one marriage. None or two give no Suggestion.
4. **Agrees or differs.** The Suggestion says what the Transcription gives and whether it agrees with the Fact's date, as precisely as both give it (1867 agrees with 15 MAY 1867; 9.8.1856 differs from 8 SEP 1856). A Fact with no date agrees with any. A differing one is still suggested: a source that disagrees is evidence too, and shows the conflict in _Events_ once confirmed.

Residence is left out: the 2 313 placeless RESI Facts are copies of the rippikirja Citations, and whether they stay is a decision of its own (ADR-0021). Places aren't compared: the Transcription's place names and the tree's don't match reliably.

## In the panel

- **_Supports_ toggles:** a suggested Fact's toggle is marked as suggested, with what the Transcription says ("Transcription: 15.5.1867", or "Transcription: 9.8.1856, differs"). Pressing it adds support as any toggle does: a Change on the Citation.
- **_Sources_ list:** a Citation with Suggestions shows a small marker in its row, so they're seen without unfolding each one.
- **Confirm all:** _Sources_ offers "Confirm N agreeing suggestions" when the person has any, which adds each one's support, a Change each. Differing ones are confirmed one at a time.
- A suggestion that's wrong is left unpressed. It stays marked; there's no "not this", as the toggle is there anyway.

## Structure

- **`src/server/citations/transcription.ts`** (new): a Transcription's events, from fields (`RecordField[]`), and the plain-line fields of a converted Citation. The Finnish month dates (`isoDate`, now in `myheritage/record.ts`) move here, as they're the Transcription's, not MyHeritage's; `record.ts` imports them. Nothing here reads MyHeritage's HTML, so it stays when `myheritage/` goes.
- **`src/server/citations/support.ts`:** `suggestedSupport(events, entry, facts)`, a pure rule beside `entryFact`.
- **`citations.ts`:** `CitationRow.suggests: SupportSuggestion[]` (`{ factId, says, agrees }`), read with the person's Facts (one query per person). The Entry's kind and Role come from the reference (the port gives a reference's Role, `indexRoleOf`) or the Citation's `EVEN`/`ROLE`.
- **Client:** `person-panel/supports.ts` marks the suggested toggles; `sources.ts` the row marker and _Confirm all_, through the existing support route.

## Tickets

| #   | Ticket                                                | Blocked by |
| --- | ----------------------------------------------------- | ---------- |
| 01  | A Transcription's events, outside `myheritage/`       | none       |
| 02  | Suggestions on the person's Citations                 | 01         |
| 03  | _Sources_: suggested toggles, row marker, Confirm all | 02         |
| 04  | Glossary: **Suggestion**                              | 02         |

## Open questions for Heikki

1. Confirm per person in _Sources_ (built), or also once for the whole dataset?
