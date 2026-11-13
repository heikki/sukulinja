// Schema 9 (ADR-0024): schema 7 again, now that a parish is spelled one
// way: "Pieksamaki" is Pieksämäki, "Mikkeli Maaseurakunta" Mikkelin
// maaseurakunta.

import { tidyPlaces } from './migration-7';
import type { Migration } from './migrations';

export const PARISHES_SPELLED_ONE_WAY: Migration = { to: 9, up: tidyPlaces };
