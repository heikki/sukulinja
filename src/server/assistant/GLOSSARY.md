# Assistant

Asking Claude about the tree in the app's _Assistant_ tab (ADR-0025). Spec: `.scratch/ai-assistant/spec.md`.

## Language

**Assistant**:
Claude, asked in the corner lists' _Assistant_ tab, reading the dataset through the app's own operations. It answers, and proposes changes; it writes nothing itself.
_Avoid_: chatbot, AI (alone), agent.

**Conversation**:
The questions asked in the tab and their answers, kept in the app's memory until _New conversation_ or the app closes.
_Avoid_: chat, session, thread.

**Operation**:
One thing the assistant may ask of the dataset, described once in its catalogue. A read (find people, a person, the places, the Facts at a place, the Reminders, the Changes) answers at once. A write (add or edit a Fact, a source supporting a Fact, rename a person, move them to another family, a Reminder) only proposes one of the app's own operations. Each is a tool Claude is given.
_Avoid_: function, command.

**Left out**:
Someone who may be living, whom the operations don't give: no death recorded, and born within 110 years or with no birth year. Only the person on screen is given anyway.
_Avoid_: hidden, private, redacted.

**Proposal**:
The changes the assistant proposed in a Conversation, each with its reason, listed for the person to tick and _Apply_. Applying runs each ticked one through the app's own operation, which checks it by its rules and writes its Change, made _via assistant_ (ADR-0028).
_Avoid_: suggestion, plan.
