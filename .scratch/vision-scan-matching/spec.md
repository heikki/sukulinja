Status: ready-for-agent

# Matching citations to their exact scans with a vision model

## Problem Statement

Most Church-book references link to a guess. Of the 3,596 church-book citations in the tree today, only 137 are **Placed** on their exact Image:

- 1,978 rippikirja references are **Anchored** or **Estimated**: counted from Anchors read by hand, or from the Book's usual numbering. They are often one or more Images off.
- 1,108 baptism and marriage index references have no page, so they only open the **Volume**, and I have to page through hundreds of Images to find the entry.
- 16 are **Split**: the app can't tell which Part the reference is in.
- 281 rippikirja references have no page or a page outside the Volume, so they only open the Volume.

Each fix today is manual: I find the Image in the Scan viewer and mark it. Marking a page in a Volume the reference already links saves an Anchor. But when the reference has a Record number, the app forgets that this record is on this Image. A Seen record would keep that citation exact, and it would extend the Volume's Record range so neighbouring records are routed to the right Volume too.

## Solution

A vision model reads the scans so that I don't have to:

- **Page search:** for a reference with a page, it reads Page numbers off Images and moves toward the cited page until it lands on it.
- **Date search:** for a baptism or marriage index reference, it reads the dates written in the book and closes in on the cited date. These books run in date order.
- **Name check:** it then confirms that the person is actually written on the Image it found. Only a confirmed match is saved. The name check also catches misread page numbers, numbering that starts over, and the wrong copy in a Doubled volume.

A confirmed match is saved the same way a hand correction is:

- a **Seen record** when the reference has a Record number,
- otherwise a **Placement**.

Either way the link becomes Placed and survives re-imports. Seen records also extend Record ranges, so future imports land in the right Volume more often.

Marking an Image by hand in the Scan viewer also starts saving a Seen record. Nothing I mark is thrown away, and nothing I mark is ever overwritten by a vision match.

The bulk pass runs as a script, unattended and resumable, against the same data folder the app reads. References it couldn't confirm go into a review list that I work through in the Scan viewer.

## User Stories

1. As a researcher, I want every church-book citation to open on the exact Image the record is on, so that I can read the original entry without paging through the Volume.
2. As a researcher, I want baptism and marriage index citations to open on the Image with the entry, so that the 1,108 citations without a page become useful.
3. As a researcher, I want Split references resolved to the one Part that holds the person, so that I don't have to try each candidate Volume.
4. As a researcher, I want a match saved only after the person's name is confirmed on the Image, so that an automatic link is never confidently wrong.
5. As a researcher, I want names in other spellings to count as a match, so that a Swedish-form name in the book confirms a Finnish-form name in the tree. That covers Johan for Juho, patronymics, and old spellings.
6. As a researcher, I want a cited page that MyHeritage misread to be found anyway, by the name check searching the Images around it, so that indexing errors don't leave a link pointing at the wrong page.
7. As a researcher, I want numbering that starts over partway through a Volume to be handled, so that a cited page in the second sequence isn't matched in the first.
8. As a researcher, I want a Doubled volume matched in the copy the references were indexed from, so that links stay consistent with my existing Anchors.
9. As a researcher, I want an entry that continues onto the next Image, or sits on a Retake, to still be found, so that the name check doesn't fail just because the entry isn't all on the computed Image.
10. As a researcher, I want a confirmed rippikirja match saved as a Seen record, so that the link stays exact even when Anchors in that Volume change later.
11. As a researcher, I want a confirmed index match saved as a Placement keyed by its MyHeritage record URL, so that it survives re-imports.
12. As a researcher, I want a confirmed match to add the matched page as an Anchor, so that unmatched references in that Volume are counted from better data.
13. As a researcher, I want a Seen record outside its Volume's known Record range to extend that range, so that records numbered in between are routed to the right Volume, including in future imports.
14. As a researcher, I want a Record range never extended across another Volume's range, so that one wrong match can't move a whole block of records into the wrong Volume.
15. As a researcher, I want marking an Image by hand in the Scan viewer to also save a Seen record when the reference has a Record number, so that my hand corrections teach the app as much as vision matches do.
16. As a researcher, I want my hand corrections to always win over vision matches, so that the bulk pass never undoes work I did myself.
17. As a researcher, I want the Seen records and Anchors that ship with the app treated as hand-made, so that the pass never overrides them either.
18. As a researcher, I want to see in the source panel when a link was matched by the vision model rather than by me, so that I know how much to trust it.
19. As a researcher, I want to correct a vision match in the Scan viewer just like any other link, so that a bad match is one click to fix.
20. As a researcher, I want a review list of references the pass couldn't confirm, with the reason, so that I can work through them by hand. Reasons include: name not found, Image unreadable, search didn't converge, and no candidate Volume.
21. As a researcher, I want the review list to name the parish, Volume and the Image the search ended on, so that I can open the Scan viewer close to where the entry should be.
22. As a researcher, I want the pass to skip references that are already Placed, so that re-running it only costs money for new or unconfirmed references.
23. As a researcher, I want the pass to be resumable after a crash or Ctrl-C, so that a six-hour run doesn't start over.
24. As a researcher, I want to limit a run to a parish, a Volume or a number of references, so that I can try it small before running everything.
25. As a researcher, I want a dry run that reports what it would save without writing, so that I can check results before they reach my data.
26. As a researcher, I want progress and a running cost estimate printed during the pass, so that I know how far it is and what it's spending.
27. As a researcher, I want a final tally by reference type and outcome, like the existing mapping script prints, so that I can see what the pass achieved.
28. As a researcher, I want every reading cached on disk, so that re-runs, retries and later passes don't pay for the same Image twice.
29. As a researcher, I want the pass to fetch Images from Astia one at a time with a gap, so that the archive's service isn't hammered by a bulk job.
30. As a researcher, I want fetched Images kept in the existing scan cache, so that the Scan viewer opens them instantly afterwards.
31. As a researcher, I want an accuracy evaluation run against Images whose page numbers and records I already know, so that I can see how often each model reads correctly before trusting it with my data.
32. As a researcher, I want the evaluation to report exact, wrong and unreadable rates and the cost per reading, for each kind of question and model, so that I can choose the cheapest model that is accurate enough.
33. As a researcher, I want "can't read" to be an answer the model can give, so that a smudged page number is skipped rather than guessed.
34. As a researcher, I want a model decline treated as "can't read", so that one refused Image doesn't stop the pass.
35. As a researcher, I want the API credentials taken from my environment or `ant auth login` profile, so that no key is stored in the repo or the app.
36. As a researcher, I want the app itself to make no model calls, so that browsing the tree stays free, offline-friendly and fast.

## Implementation Decisions

**The Reader (new seam).** A small interface puts the vision model behind three questions about one Image of a Volume:

- _page numbers_: the Page numbers written on it, or unreadable;
- _dates_: the earliest and latest entry dates on it, for baptism and marriage books, or unreadable;
- _find entry_: whether a named person, with an optional date and village, is written on it, plus a confidence. The match is spelling-tolerant (Swedish and Finnish name forms, patronymics, W for V).

Answers are structured. "Unreadable" and "not found" are first-class answers, never errors. The matcher depends only on this interface.

**The real Reader** calls the Claude API through the official TypeScript SDK and uses structured outputs:

- Page number and date questions default to Claude Haiku 5.5 at low effort.
- Find-entry defaults to Claude Sonnet 5.5.
- The final choices come from the evaluation, and the models are configurable.
- A `refusal` stop reason maps to unreadable. Haiku 5.5 requests carry no `fallbacks` parameter.
- Whether to crop and scale Images, for example the top strip for page numbers, is decided by the evaluation.

**Reading cache.** Every Reader answer is cached on disk in the data folder, beside the Astia caches. It is keyed by Volume, Image, question (including the name asked about) and model. A changed model re-reads; a re-run doesn't.

**The matcher.** It takes a Church-book reference and the candidate Volumes from the existing resolution, and returns either a confirmed Image or an unconfirmed outcome with a reason and the last Image it tried.

- _Page search_, for references with a Page number: start at the Image the current Anchored or Estimated method gives. Read its Page number, jump by the difference, and repeat. Reads are capped (a small number, e.g. 6) before giving up as "didn't converge". A reading that contradicts the Volume's numbering direction, as when numbering starts over, is treated as a signal to stay near the Anchors rather than to jump.
- _Date search_, for baptism and marriage index references: binary search over the Volume's Images by the dates read, to the Image whose range covers the cited date.
- _Confirmation_: run find-entry on the Image the search landed on. If the person isn't there, check its neighbours (±1 for continuations and Retakes, then a small window for misread pages). Only a find-entry "found" confirms.
- _Split references_: search each candidate Volume. The one where the person is found wins. More than one find leaves the reference unconfirmed as ambiguous.
- Rippikirja references with no Page number are out of scope (see below). The matcher reports them as unsupported.

**Church-book reference gains two fields.** These are parsed in the existing record parser:

- the record's person name: for rippikirjat, the record's principal from the transcription; for index references, from the citation text;
- the full event date for index references, at day precision where the text gives it, with Finnish month names parsed ("29. Marras 1829").

**Provenance on saved corrections.** Seen records, Placements and Anchors carry `by: "hand" | "vision"`. A missing value means hand, which covers everything that ships with the app and every existing local file.

- A vision save never replaces or removes a hand entry for the same record, URL, Image or page.
- A hand save replaces a vision entry.
- The anchors store's existing merge of local over shipped stays as it is, with this rule added.

**Saving a confirmed match.**

- With a Record number: a local Seen record for that Volume, plus an Anchor for the matched page when the reference has one.
- Without one: a Placement keyed by the record URL.

**Record range extension.** When a Seen record is saved, by hand or by vision, outside every Record range of its Volume, the nearest range of that Volume is extended to include it. If another Volume's range lies between them, nothing is extended. The extension goes to the local file. This relies on each Volume's records forming one unbroken block on its Film.

**Hand marking saves Seen records.** When the reference has a Record number, the existing scan correction saves a hand Seen record and extends the Record range, alongside the Anchor or Placement it already saves.

**Scan provenance in the API.** A Placed scan carries `by`, so the source panel can mark vision matches. The Scan method itself is unchanged: a vision match is Placed.

**The runner.** This is a script, beside the existing citation-mapping script.

- It reads a dataset's church-book citations from its database.
- It runs the matcher on every reference that isn't already Placed and saves confirmed matches into a given data folder (default: the repo's). Those are the same local files the app reads.
- Options: data folder, dataset, parish/Volume filter, limit, dry run.
- It writes a review list as markdown beside the existing mapping checklist, plus a tally.
- It is resumable through the reading cache and by skipping references already Placed.

**Astia load.** The runner fetches full-size Images through the existing image cache, one at a time with a gap like the metadata crawl. Interactive Scan viewer fetches are unchanged.

**The evaluation script.**

- It samples Images with hand Anchors and hand Seen records from the shipped anchors.
- It asks the Reader the matching questions, including find-entry for a known name and for a decoy name from elsewhere in the Volume.
- It reports exact, wrong and unreadable rates and cost, per question and model.

**Gate.** The runner refuses to write anything (dry run is allowed) until an evaluation has shown a find-entry false-confirmation rate of 1% or less for the configured model. The result is recorded in the data folder.

**No model calls from the app.** The app only reads what the runner saved.

## Testing Decisions

- **A good test** drives the matcher or runner the way the system uses it and asserts on outcomes the app observes: what `resolveScans` returns afterwards (method, Image, `by`), and what the anchors store loads (Seen records, Record ranges, Anchors, Placements). It does not assert on search steps, read counts or cache file layout. The one exception is that a re-run makes no new Reader calls, observed through the fake Reader.
- **One new seam: the Reader.** Tests inject a fake Reader that answers from a scripted Volume: a Page number per Image, dates per Image, and which names are on which Images. Astia is faked at `fetch`, as the image-cache tests do. The local files go in a temp data folder, as the anchors tests do. The real Reader is exercised only by the evaluation script, never in unit tests.
- **Matcher and runner behaviour to cover:**
  - page search converging from an Estimated start;
  - a misread cited page found by the neighbour check;
  - numbering that starts over;
  - a Doubled volume;
  - date search in a baptism Volume;
  - a Split resolved by the name check, and a Split left ambiguous when the name is found in both Parts;
  - unreadable Images and a search that doesn't converge, both landing in the review list with the right reason;
  - a dry run that writes nothing;
  - already-Placed references skipped;
  - hand entries never overwritten by vision;
  - vision entries replaced by hand;
  - the gate blocking writes without a passing evaluation.
- **Corrections to cover:** a hand marking with a Record number saves a Seen record; Record range extension; no extension across another Volume's range.
- **Parser to cover:** person name and full-date parsing for both reference types, with real citation text in the style of the existing record tests. Use made-up names, not people from the tree.
- **Prior art:** the image-cache tests (fake Astia via a `fetch` spy, a listing per Volume), the anchors tests (temp local folder, merge over shipped), and the record tests (citation-text parsing).

## Out of Scope

- **Rippikirja references with no Page number (281).** These need a village map per Volume: the order of villages and the Image ranges where each starts, read once like Anchors. They get a separate spec once page and date search have proven the Reader.
- **Unparsed references (55).** That's a parser problem, not a vision one.
- **References in Volumes that aren't digitized, or with no matching Volume (21).** There's no scan in Astia to match.
- **Creating new citations by transcribing entries from scans.** That's a separate idea with its own storage question, since the imported tree can't be edited.
- **Matching or suggesting people in the tree from what's on a scan.**
- **Running the matcher from inside the app**, including a "match this one" button in the Scan viewer. It may follow once the bulk pass has proven itself.
- **Copying local Anchors and Seen records into the shipped anchors file.**
- **Parishes missing from the parish-to-archive table.**

## Further Notes

- **Rough cost of a full pass over today's tree:** about $5 of Haiku reads for searching, and about $40–80 of Sonnet reads for name checks. That's roughly 15–20k Image fetches from Astia, about 6 hours at one a second, so run it overnight or over several nights. The evaluation costs well under $1. Prices are Claude API first-party rates as of October 2026.
- **Suggested order of slices:**
  1. Hand marking saves Seen records and extends Record ranges, with provenance. This is useful on its own, without any model.
  2. The Reader and the evaluation script.
  3. The matcher with date search, which covers the largest group (1,108).
  4. Page search, Split resolution and confirmation.
  5. The runner and review list.
  6. The vision marker in the source panel.
- **Glossary terms to add** to the Citation scans context when this lands: **Reader** (the vision model behind the three questions), **Vision match** (a Seen record or Placement confirmed by the name check, as opposed to marked by hand), and **Confirmation** (finding the person's name on the Image). "Placed" continues to cover both hand and vision.
- The "don't fix data errors" principle holds: the pass links each citation to the entry it cites, and it never changes what the citation says. A misread Page number stays as cited, and the Anchor records the cited number with a note, as hand Anchors already do.
