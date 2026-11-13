Status: done

# Claude client shared with the Reader; key in the credential store and Settings

`src/server/claude/`: the client, its credentials and prices, moved from `scripts/vision/claude-reader.ts`, which uses them from there. The assistant's API key is kept in the system's credential store (`Bun.secrets`: the Keychain on macOS), set and removed in Settings (`/settings/assistant-key`); without one, the environment's credentials are used, as the Reader does.
