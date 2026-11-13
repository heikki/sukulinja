Status: done
Blocked by: 02, 03

# Assistant loop and route, read-only answers

`src/server/assistant/`: the tool loop over the Claude API (`claude-opus-5-5`, adaptive thinking, effort medium, streaming, refusal fallback), conversations kept in memory, and `POST /api/assistant` streaming its progress and answer as NDJSON, `DELETE /api/assistant/:id` forgetting one. The model is behind a port so tests script it.
