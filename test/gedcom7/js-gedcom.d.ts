// js-gedcom ships no types; only what the validator helper calls.
declare module 'js-gedcom/gedcstruct.js' {
  export const g7ConfGEDC: unknown;
  export const GEDCStruct: {
    fromString: (
      text: string,
      config: unknown,
      err: (msg: string) => void
    ) => unknown[];
  };
}
declare module 'js-gedcom/g7lookups.js' {
  export class G7Lookups {
    constructor(validation: unknown);
    err: (msg: string) => void;
    warn: (msg: string) => void;
  }
}
declare module 'js-gedcom/g7structure.js' {
  export const G7Dataset: {
    fromGEDC: (gedc: unknown[], lookups: unknown) => unknown;
  };
}
