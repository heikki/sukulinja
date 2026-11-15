# The assistant sees who is on the chart

Status: needs-triage

Goes with 08 (steering the view): once the assistant can select someone, the chart it sees follows.

## What

Today a question carries only the Selected person. The assistant should also know who is on the chart at that moment, so a question like "which of these have no birth place?" or "check the residences of everyone shown" works without naming each person.

## How it could work

- The client sends the ids of the people the chart shows (within the Generation limit) with the question, beside `personId`.
- The server adds them to the "on screen" part of the question (run.ts), as names, years and ids, e.g. "On the chart: Matti Esimerkki (1801–1860, id 1), Liisa Malli (1805–1870, id 2) …", and the tools can be pointed at those ids.
- A large chart is cut to a limit (say 60 people) and says so, to keep the question's cost down.

## Open questions

- Living people on the chart: today only the Selected person is exempt from leaving out the living (ADR-0025). Keep that (suggested), so the living shown on the chart stay out, or treat everyone on screen as exempt?
- Only who is shown, or also how they relate to the Selected person (parent, grandparent …)?
