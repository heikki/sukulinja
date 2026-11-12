import { html } from 'lit';

import type { Sex } from '@/common/types';

// A person's sex as the forms name it.
const SEXES: Array<[Sex, string]> = [
  ['M', 'Male'],
  ['F', 'Female'],
  ['X', 'Other'],
  ['U', 'Unknown']
];

// The word for a sex, lower-case: "male".
export function sexWord(sex: string | null) {
  const label = SEXES.find(([value]) => value === sex)?.[1] ?? 'Unknown';
  return label.toLowerCase();
}

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
      ${SEXES.map(
        ([value, label]) =>
          html`<option value=${value} ?selected=${value === sex}>
            ${label}
          </option>`
      )}
    </select>
  </label>`;
}
