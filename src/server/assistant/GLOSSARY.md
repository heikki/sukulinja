# Assistant

Asking Claude about the tree in the app's _Assistant_ tab (ADR-0025). Spec: `.scratch/ai-assistant/spec.md`.

## Language

**Assistant**:
Claude, asked in the corner lists' _Assistant_ tab, reading the dataset through the app's own operations. It answers; it doesn't change the tree.
_Avoid_: chatbot, AI (alone), agent.

**Conversation**:
The questions asked in the tab and their answers, kept in the app's memory until _New conversation_ or the app closes.
_Avoid_: chat, session, thread.

**Operation**:
One thing the assistant may ask of the dataset, described once in its catalogue: find people, a person, the places, the Facts at a place, the Reminders, the Changes. Each is a tool Claude is given.
_Avoid_: function, command.

**Left out**:
Someone who may be living, whom the operations don't give: no death recorded, and born within 110 years or with no birth year. Only the person on screen is given anyway.
_Avoid_: hidden, private, redacted.

**Proposal**:
Changes the assistant would make, listed for the person to confirm one by one; applied through the same operations, each writing its Change. Not built yet (ticket 06).
_Avoid_: suggestion (a **Suggestion** is a Fact a Transcription gives, Citations glossary), plan.
