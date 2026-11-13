# The assistant reads through the app's operations

Heikki (2026-11-13) wanted an AI assistant in the app, kept general: he asks in his own words, and renaming places was only one example (`.scratch/ai-assistant/spec.md`). The tree holds living relatives, and anything the assistant reads goes to Anthropic.

- **Claude, through the Claude API, from the app's Bun process.** `claude-opus-5-5` with adaptive thinking, the tools defined in the app (`src/server/assistant/`). The webview shows the conversation; the key and the requests never reach it. Not the Agent SDK or Managed Agents: there's nothing to run in a sandbox, and the data is local.
- **Its tools are the app's own operations.** A dataset's operations are built once, apart from its routes (`datasets/services.ts`), and the assistant's catalogue (`assistant/operations/`) describes each one it may use: what Claude is told, its input schema (a strict tool), what the person is shown while it runs, and the service call. It has no SQL and no write path of its own.
- **It only reads, for now.** Writing comes later as a Proposal the person confirms, applied through the same operations so each edit is checked by their rules and writes its Change (ticket 06).
- **Who may be living is left out** of what the tools give: no death recorded, and born within 110 years or with no birth year (`assistant/living.ts`). Only how many were left out is said. The person on screen is the exception, as the question is about them.
- **A conversation is kept in memory only**, never written to disk; _New conversation_ forgets it.
- **The API key is kept in the system's credential store** (`Bun.secrets`, the Keychain on macOS), set in Settings; without one the environment's credentials are used, as the scan Reader's are. The Reader and the assistant share one client (`claude/client.ts`).

## Considered options

- **Let Claude query the database.** Rejected: it would skip the operations' rules and Changes, and the living rule couldn't be held.
- **Send living people too.** Rejected by Heikki: they haven't agreed to it.
- **Keep the key in a file in the data folder.** Rejected: a plain-text secret beside the datasets, and in their backups.
