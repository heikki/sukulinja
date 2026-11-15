# The Scan viewer runs Vision Match on one reference

Heikki (2026-11-15) wanted to try the vision pass from the app before deciding whether the assistant should use it: on a reference whose Link is an estimate, see how near the Match is, what it costs and how long it takes. Until now the pass ran only from `scripts/match-citation-scans`, over a whole dataset, and the app never called a model for it.

- **The Reader and the matcher live in the server**, in `src/server/citations/myheritage/vision/`, as they search MyHeritage's references; the scripts use them from there. They go when that folder does (ADR-0016).
- **_Find with Vision Match_** is in the Scan viewer's menu while the Assistant is on, for a source whose Link is an estimate. It runs the same search as the script, on that one reference (`findByVision`), with the model picked in Settings (_Vision Match_, Haiku by default) for all three questions, and the Assistant's key (ADR-0025).
- **_Find all estimates here_** runs it for every estimate on the Image shown, one per record, one after another (amended 2026-11-15, as one at a time was laborious). Its summary says how many it found and what they took together; the Boxes it found show on the scan while it's open, and those not found stay under Estimate beside it.
- **_Find all estimates here at once_** asks for all of them in one question instead, on the Image shown alone (amended 2026-11-15, to compare what it costs and finds against one at a time). It reads no page numbers or dates and doesn't look on the Images around, as the search for one does; what it confirms is checked and saved as theirs is. Its readings are kept apart from those of one person at a time.
- **_Undo all_** on a batch's summary takes back every Match it found, as a Discard of each would.
- **A Match it confirms is saved as the script saves one**: a suggestion with its Box, which the person confirms (a Mark) or discards in the Scan viewer. Nothing is Marked, and as with the script, saving a Match writes no Change.
- **Discarding a Match only undoes it** (amended 2026-11-15): the Link goes back to the estimate, and nothing else is kept, neither a Rejection nor a Change. It undoes a search, not a finding that the entry isn't there; a later run of the script may save the same Match again. The old `rejections` table is no longer written or read, and goes with the rest (ADR-0016).
- **No accuracy gate.** The script saves nothing until `scripts/evaluate-reader` has shown the model confirms at most 1% of decoys, as it runs unattended. A search asked for one reference is checked by the person at once, so it isn't gated. The script's gate stays.
- **It says what it took**: the questions asked, how many of them earlier readings answered (they're kept in the data folder's `.vision-readings`, shared with the scripts), what the rest cost, and the seconds. Scans are scaled with macOS's `sips`, so it runs only on the Mac.

## Considered options

- **Give the assistant a tool for it straight away.** Not yet: whether it's worth it is what trying it shows.
- **A model setting shared with the assistant.** Rejected: reading handwriting may want a larger model than answering questions.
