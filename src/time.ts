/**
 * Time duration constants (in milliseconds)
 * Single source of truth for the unit conversions used by German date parsing
 * (relative offsets) and tracking retention/timestamp math.
 */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
