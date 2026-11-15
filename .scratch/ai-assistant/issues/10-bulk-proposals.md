# The assistant proposes a change by rule

Status: needs-triage

## What

A change across much of the tree (hundreds or thousands of people) doesn't fit item-by-item Proposals: one answer makes at most 25 requests, each item is one tool call, the conversation grows with each, and the person can't review a thousand items. Instead the assistant proposes a _rule_, and the app applies it to every row it covers.

Example (invented): "In every Fact, the place `Kylä, Pitäjä` becomes `Kylä, Pitäjä, Suomi`."

## How it could work

- A write operation per kind of rule, e.g. `rename_place_everywhere` (from, to). Its `asks` counts the rows the rule covers and picks a few examples, so the Proposal item says "Changes 412 Facts", with examples to open.
- Applying runs the app's own operation for each row (ADR-0028), inside one backup (the >10 rule already takes one) and one Change per row, marked via assistant.
- Rows on someone who may be living follow the Living people setting (ADR-0025).

## Open questions

- Which rules first? Place renames look like the commonest; the Places rename tool for old spellings (`.scratch/small`) may be the same feature.
- Should a rule's item list every row it would change for checking, or only the count and examples?
