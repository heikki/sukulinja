Status: done

# Suggested support for old Citations

Glossary: **Citation**, **Fact**, **Support**, **Transcription**, **Entry**, **Role** (`src/server/citations/GLOSSARY.md`). Decision this builds on: ADR-0022 (a Citation supports Facts). Earlier: `.scratch/fact-evidence/spec.md` ("Not in this feature"), `.scratch/citation-practices/fact-citations.md` option C.

Heikki, 2026-11-13: agreed to suggest support for the existing Citations from their Transcriptions, for him to confirm.

## Where it is now

- ylonen has 3 835 Citations, all on their person, and none supports a Fact. Support was added by hand in _Sources_ (the _Supports_ toggles, since removed), or made when a Citation is made in the Scan viewer (`entryFact`).
- Most Citations have a Transcription that names events with dates: "Syntymäpäivä: 15. Touko 1867", "Ristiäiset: 29. Marras 1829 - Mikkeli, …", "Kuolinpäivä: …". A MyHeritage reference keeps it as MyHeritage wrote it (`CitationRow.record` reads it into fields); a converted one as plain `Label: value` lines (ADR-0016); one made in the Scan viewer as typed.

## The rule

A **Suggestion** is a Fact of the Citation's person that the Citation's Transcription gives; the panel shows it as one while the Citation doesn't support it yet. It's derived each time the person's Citations are read, and nothing of it is stored.

1. **The Transcription's events.** Its fields read as events by label: _Syntymäpäivä_, _Syntymäaika_, _Syntymä_ → Birth; _Ristiäiset_, _Kaste_ → Christening; _Kuolinpäivä_, _Kuolema_ → Death; _Hautaus_ → Burial; _Avioliitto_ → Marriage. The value's date is read as MyHeritage writes it ("15. Touko 1867", "Touko 1867", "1867"); a value with no year gives no event.
2. **Whose events they are.** A household line (rippi- or lastenkirja) is about the person it's cited for, so all its events are theirs. A baptism Entry gives the Birth and Christening only to its child (Role `CHIL`), a marriage Entry the Marriage only to its spouses. A parent's or godparent's Citation, or one whose Role isn't known, gives nothing.
3. **Which Fact.** The person's one Fact of that kind: theirs, or for a Marriage, their one marriage. None or two give no Suggestion.
4. **Agrees or differs.** The Suggestion says what the Transcription gives and whether it agrees with the Fact's date, as precisely as both give it (1867 agrees with 15 MAY 1867; 9.8.1856 differs from 8 SEP 1856). A Fact with no date agrees with any. A differing one is still suggested: a source that disagrees is evidence too, and shows the conflict in _Events_ once confirmed.

Residence is left out: the 2 313 placeless RESI Facts are copies of the rippikirja Citations, and whether they stay is a decision of its own (ADR-0021). Places aren't compared: the Transcription's place names and the tree's don't match reliably.

## In the panel

- **_Events_:** picking a Fact shows under it the sources supporting it, if any (a click opens one in the Scan viewer), then _Edit event_ (opens its form; it replaced a second click on the Fact) and _Add source…_ (none yet) or _Edit sources…_, with "(N suggested)" when any is. It lists all the person's sources, each with a checkbox that adds or takes back its support (a Change on the Citation): in Astia's order as in Church books (by archive, then reference code; those with no scan after, by Book then year), a suggested one with what its Transcription says ("suggested · says 21.11.1829, differs" when it differs). Esc closes it. (Heikki, 2026-11-13: confirming where the Fact is looked at; first built as a "Confirm N agreeing suggestions" button, a row marker in _Sources_, a _Suggested_ list with _Confirm_, and _Supports_ toggles in a source's details, and a right-click _Remove as source_, all removed: support is now added and taken back only in _Events_.)
- A suggestion that's wrong is left unconfirmed. It stays suggested; there's no "not this".

## Structure

- **`src/server/citations/transcription.ts`** (new): a Transcription's events, from fields (`RecordField[]`), and the plain-line fields of a converted Citation. The Finnish month dates (now `transcribedDate`, formerly `isoDate` in `myheritage/record.ts`) moved here, as they're the Transcription's, not MyHeritage's. Nothing here reads MyHeritage's HTML, so it stays when `myheritage/` goes.
- **`src/server/citations/support.ts`:** `personsEvents(events, event, role)`, the whose rule, beside `entryFact`.
- **`citations.ts`:** `CitationRow.transcribed`, the events its Transcription gives its person. It depends on the Citation alone, so every CitationRow carries it, and it stays right after a support is toggled. The Entry's Event comes from a reference's Book or the Citation's `EVEN`; the Role from the Citation's `ROLE`, which the References port reads for a reference (`roleOf`, MyHeritage's `indexRoleOf`).
- **`src/common/suggestions.ts`:** `suggestedSupport(transcribed, facts)`, the pure match against the person's Facts (`dateAgrees` in `common/dates.ts`), used by the panel; a dataset-wide pass could use it on the server as it is.
- **Client:** `person-panel/fact-sources.ts` shows a picked Fact's sources and suggestions in _Events_; `supports.ts` marks the suggested toggles; both through the existing support route.

## Tickets

All done 2026-11-13.

| #   | Ticket                                                | Blocked by |
| --- | ----------------------------------------------------- | ---------- |
| 01  | A Transcription's events, outside `myheritage/`       | none       |
| 02  | Suggestions on the person's Citations                 | 01         |
| 03  | _Sources_: suggested toggles, row marker, Confirm all | 02         |
| 04  | Glossary: **Suggestion**                              | 02         |

## Open questions for Heikki

1. ~~Confirm per person in _Sources_, or also once for the whole dataset?~~ Per person (Heikki, 2026-11-13).
