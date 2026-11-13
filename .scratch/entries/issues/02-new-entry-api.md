Status: needs-triage
Blocked by: 01

# Making an Entry with its people

- `entries` module beside `app-citations.ts`: create an Entry with a list of `{ personId, role }`, add a person, remove a person (the last takes the Entry), delete the Entry, retype its Transcription.
- Routes under `/api/entries`; each Citation made or removed is a Change, as `cite` is now.
- Support: each new Citation supports its `entryFact`, as `support.recorded` does now.
- The old one-person create becomes an Entry with one person.

Done when: server tests cover a baptism with child, father and mother (only the child's Christening supported), adding a person later, and removing the last person.
