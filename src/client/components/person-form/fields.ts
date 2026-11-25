import { html } from 'lit';

import type { Sex } from '@/common/types';

// A person's sex as the forms name it.
const SEXES: Array<[Sex, string]> = [
  ['M', 'Male'],
  ['F', 'Female'],
  ['U', 'Unknown']
];
// GEDCOM's X, offered only to one who has it, so it isn't lost unasked.
const OTHER: [Sex, string] = ['X', 'Other'];

// A name's field, labelled, telling `set` what's typed.
export function nameField(
  label: string,
  hint: string,
  value: string,
  set: (value: string) => void
) {
  return html`<label>
    <span>${label}</span>
    <input
      type="text"
      autocomplete="off"
      placeholder=${hint}
      .value=${value}
      @input=${(e: Event) => {
        set((e.target as HTMLInputElement).value);
      }}
    />
  </label>`;
}

// The sex picked, telling `set` when another is.
export function sexField(sex: Sex, set: (sex: Sex) => void) {
  return html`<label>
    <span>Sex</span>
    <select
      @change=${(e: Event) => {
        set((e.target as HTMLSelectElement).value as Sex);
      }}
    >
      ${(sex === 'X' ? [...SEXES, OTHER] : SEXES).map(
        ([value, label]) =>
          html`<option value=${value} ?selected=${value === sex}>
            ${label}
          </option>`
      )}
    </select>
  </label>`;
}
