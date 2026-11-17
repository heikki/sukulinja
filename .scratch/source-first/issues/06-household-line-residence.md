Status: ready-for-agent

Blocked by: 02

# A household line makes a Residence

Spec: `../spec.md`. ADR-0033.

A rippikirja or lastenkirja line: one person, no Role; village and farm. Its Residence runs `FROM` and `TO` the Volume's years at the farm. One at the same place with overlapping years is supported; else a new one. The Role-less card's _People on this line_ and _Add person…_ go.

Done when: tested on the server (new, overlapping, next Volume), and `bun dev` in dark mode with a screenshot.
