# GEDCOM 7 test material

- `maximal70.gdz`: FamilySearch's GEDZIP exercising every standard GEDCOM 7 tag, with media. From [gedcom.io/tools](https://gedcom.io/tools/) (`https://gedcom.io/testfiles/gedcom70/maximal70.gdz`), part of [FamilySearch/GEDCOM](https://github.com/FamilySearch/GEDCOM), Apache License 2.0. Fetched 2026-10-21.
- `validate.ts`: checks a `gedcom.ged` with [js-gedcom](https://github.com/gedcom7code/js-gedcom) (MIT or Unlicense, a devDependency pinned to commit `9296068`) against `g7validation.json` from [FamilySearch/GEDCOM-registries](https://github.com/FamilySearch/GEDCOM-registries) at commit `19ce01e`. That repo has no license, so the file isn't committed: the first test run downloads it into `.cache/`.
- `js-gedcom.d.ts`: types for the parts of js-gedcom the helper calls.
