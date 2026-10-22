Status: needs-triage

# Reminders on a person, Citation or other record

Glossary: **Citation**, **Annotation**, **Scan viewer**.

Idea: leave yourself a Reminder inside the app on a person, a Citation, a family or a Volume ("check the 1803 rippikirja for a second wife", "this Mark might be the wrong Juho"), and later go through every open one in one place.

## Open questions

- **Name.** Working name **Reminder** ("Annotation" is already a Citation's app-made additions, `src/server/annotations.ts`, ADR-0013, and "Note" clashes with GEDCOM `NOTE`). Confirm, then add it to the glossary.
- **What it can be on.** Person, family, Citation, Volume or Image, a Box. Each one changes what a re-import's merge has to carry over, as it does for Marks and app-made Citations.
- **Does it leave the app.** ADR-0013 makes the database the master copy and the GEDZIP how all of it leaves and comes back. Exported as a GEDCOM `NOTE`, a Reminder would and survive a round trip, but then it shows up in MyHeritage too. Kept app-only, it has to survive the merge on its own, and is lost if the dataset goes out and back as GEDZIP.
- **Open / done.** Whether a Reminder can be marked done, and whether done ones stay visible.
- **Where you review them.** A list on the chooser or in Settings, a count on the person panel, a marker on the chart's cards.
- **Where you write them.** Following the right-click-menu convention: "Add reminder…" on a card, a Citation in the person panel, an entry in the Scan viewer.

## Comments
