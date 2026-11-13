Status: ready-for-agent

# A Transcription's events, outside `myheritage/`

Spec: `../spec.md`.

- New `src/server/citations/transcription.ts`: `plainFields(text)` reads a converted Citation's `Label: value` lines into `RecordField[]`; `transcriptionEvents(fields)` gives `{ tag, date, says }` for each Birth, Christening, Death, Burial and Marriage field with a year.
- Move the Finnish month `isoDate` from `myheritage/record.ts` here; `record.ts` imports it.
- Tests: MyHeritage fields, plain lines, glued dates, no year, two fields of one kind.
