export type Sex = 'M' | 'F' | 'U' | 'X' | null;
export type Scope = 'person' | 'family';

export interface Person {
  id: number;
  xref: string;
  sex: Sex;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  primary_photo: string | null;
}

export interface Family {
  id: number;
  xref: string;
  husband_id: number | null;
  wife_id: number | null;
}

export interface Fact {
  id: number;
  scope_type: Scope;
  scope_id: number;
  tag: string;
  date_text: string | null;
  place: string | null;
  value: string | null;
  sort_order: number;
}

export interface Media {
  id: number;
  file_path: string;
  format: string | null;
}

export interface MediaLink {
  id: number;
  media_id: number;
  scope_type: Scope;
  scope_id: number;
  is_primary: number;
  title: string | null;
  crop_top: number | null;
  crop_left: number | null;
  crop_width: number | null;
  crop_height: number | null;
  sort_order: number;
}

// API row shapes returned by /api/persons and /api/families.
// Distinct from Person / Family above: those are the richer
// domain records, these are the flattened tree-view DTOs.
export interface PersonRow {
  id: number;
  given: string | null;
  surname: string | null;
  sex: string | null;
  birth_year: number | null;
  death_year: number | null;
  photo_path: string | null;
}

export interface FamilyRow {
  id: number;
  husband_id: number | null;
  wife_id: number | null;
  child_ids: number[];
}
