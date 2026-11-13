Status: needs-triage

# Drop scope_type 'fact' from the citations CHECK

From fact-evidence (ADR-0022, schema 5): `scope_type = 'fact'` isn't written any more, and the CHECK keeps it only for old files until a later schema drops it. Do it in the next schema migration that touches `citations`.
