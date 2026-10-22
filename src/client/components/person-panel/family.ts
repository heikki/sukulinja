import { gedcomDate } from '@/common/dates';
import type { FamilyRow, PersonRow } from '@/common/types';

import { otherSpouseOf } from '../tree-view/build/indices';
import type { LayoutIndices } from '../tree-view/build/indices';
import { CROSS } from '../tree-view/renderer';

export type FamilyIndices = Pick<
  LayoutIndices,
  'persons' | 'parentFamByPerson' | 'spouseFamsByPerson'
>;

// One of the people in a household, and how they're related to the person
// the panel is about.
export interface Relative {
  person: PersonRow;
  relation: string;
}

// A household as a church book lists it, but for the person: the parents,
// then the children by birth.
export type Household = Relative[];

// Named for their sex: "Brother", "Sister", or failing one "Sibling".
function relative(p: PersonRow, male: string, female: string, other: string) {
  const relation = p.sex === 'M' ? male : p.sex === 'F' ? female : other;
  return { person: p, relation };
}

// By birth year, the undated last; a year's keep their recorded order.
function byBirth(a: Relative, b: Relative) {
  const ya = a.person.birth_year ?? Infinity;
  const yb = b.person.birth_year ?? Infinity;
  return ya === yb ? 0 : ya - yb;
}

function known(ids: Array<number | null>, ix: FamilyIndices) {
  return ids.flatMap((id) => {
    const p = id === null ? undefined : ix.persons.get(id);
    return p === undefined ? [] : [p];
  });
}

function parentsOf(fam: FamilyRow, ix: FamilyIndices) {
  return known([fam.husband_id, fam.wife_id], ix).map((p) =>
    relative(p, 'Father', 'Mother', 'Parent')
  );
}

// The other children of the person's parents, then the children either
// parent had in another family.
function siblingsOf(id: number, fam: FamilyRow, ix: FamilyIndices) {
  const full = known(fam.child_ids, ix)
    .filter((p) => p.id !== id)
    .map((p) => relative(p, 'Brother', 'Sister', 'Sibling'));
  const seen = new Set(fam.child_ids);
  const half: Relative[] = [];
  for (const parent of [fam.husband_id, fam.wife_id]) {
    if (parent === null) continue;
    for (const other of ix.spouseFamsByPerson.get(parent) ?? []) {
      if (other.id === fam.id) continue;
      for (const p of known(other.child_ids, ix)) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        half.push(relative(p, 'Half-brother', 'Half-sister', 'Half-sibling'));
      }
    }
  }
  return [...full, ...half].toSorted(byBirth);
}

// The family the person was born into, then each they had: the two
// households a church book would list them in.
export function householdsOf(id: number, ix: FamilyIndices) {
  const households: Household[] = [];
  const parentFam = ix.parentFamByPerson.get(id);
  if (parentFam !== undefined) {
    const rows = [
      ...parentsOf(parentFam, ix),
      ...siblingsOf(id, parentFam, ix)
    ];
    if (rows.length > 0) households.push(rows);
  }
  for (const fam of ix.spouseFamsByPerson.get(id) ?? []) {
    const spouse = known([otherSpouseOf(fam, id)], ix).map((p) =>
      relative(p, 'Husband', 'Wife', 'Spouse')
    );
    const children = known(fam.child_ids, ix)
      .map((p) => relative(p, 'Son', 'Daughter', 'Child'))
      .toSorted(byBirth);
    if (spouse.length === 0 && children.length === 0) continue;
    households.push([...spouse, ...children]);
  }
  return households;
}

// Born and died, as precisely as recorded and written as the chart's cards
// write years: "12.3.1894 – 4.5.1965", just "12.3.1894" for the living,
// "12.3.1894 – ✝" for a death without a date, "– 1965" without a birth, and
// "Deceased" with neither.
export function lifeText(p: PersonRow) {
  const born = p.birth_date === null ? '' : gedcomDate(p.birth_date);
  const died = p.death_date === null ? '' : gedcomDate(p.death_date);
  if (!p.died && died === '') return born;
  if (died !== '') return `${born} – ${died}`.trim();
  return born === '' ? 'Deceased' : `${born} – ${CROSS}`;
}
