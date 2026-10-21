# bourbon.gdz

House of Bourbon demo dataset (303 individuals, 139 families, 47 portraits),
imported into a new data folder on first launch (`src/server/demo.ts`).

**Source**: [`D-Jeffrey/gedcom-samples`](https://github.com/D-Jeffrey/gedcom-samples)
at commit `74040285d9e764d25d25c2f66ad1da710eeb391c`, `sample-bourbon/`
subdirectory. Dual-licensed upstream as `MIT OR CC0-1.0`.

**Packing**: a FamilySearch GEDZIP. `gedcom.ged` is upstream's `bourbon.ged`,
unchanged (GEDCOM 5.5.1 from Ancestris). Beside it are the 55 files its FILE
lines name, at the same paths under `photos/` and `actes/`. The upstream
photos no FILE names, and `geo_cache.csv`, are left out. Entries carry a
fixed 1980-01-01 timestamp, photos stored and text deflated, so packing the
same commit again gives the same bytes.

**Image provenance**: the portraits originate from Wikimedia Commons
(traceable by their file names). They are overwhelmingly old-master paintings
of long-deceased European royalty, in the public domain as PD-Art. If you
redistribute this file, consider restoring per-file Wikimedia attribution,
which upstream did not preserve.
