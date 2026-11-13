// Schema 8 (ADR-0024): schema 7 again, now that a village named as its
// parish is named once: "Laukola, Haukivuori, Haukivuori, Suomi" is
// "Laukola, Haukivuori, Suomi". A database schema 7 rewrote already has
// these left; one newer than that, nothing.

import { tidyPlaces } from './migration-7';
import type { Migration } from './migrations';

export const VILLAGES_NAMED_ONCE: Migration = { to: 8, up: tidyPlaces };
