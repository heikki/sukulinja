Status: ready-for-agent
Blocked by: 01

# Start a new dataset with its first person

Spec: `.scratch/add-people/spec.md`.

Beside _Import_ in the chooser (also on "No datasets yet") comes _New dataset…_: the dataset's name, and its first person's name and sex. That person is the Root. The dataset is made the way an import makes one (`datasets/registry.ts`), with an empty tree but that person.

Tests: the new dataset opens with its one person as Root; its export is a valid GEDZIP (test/gedcom7/validate.ts).
