/**
 * German date parsing
 * Turns the various date strings found on karlsruhe.de into `Date` objects,
 * falling back to the current time when a value cannot be understood.
 */

import { CONFIG } from './config.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const RELATIVE_DATE_PATTERNS = [
  { pattern: /vor\s+(\d+)\s+stunde(n)?/i, milliseconds: 60 * 60 * 1000 },
  { pattern: /vor\s+(\d+)\s+minute(n)?/i, milliseconds: 60 * 1000 },
  { pattern: /vor\s+(\d+)\s+tag(en)?/i, milliseconds: ONE_DAY_MS },
] as const;

function parseRelativeDate(text: string, now: Date): Date | null {
  for (const { pattern, milliseconds } of RELATIVE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const amount = Number.parseInt(match[1], 10);
    if (Number.isNaN(amount)) continue;

    return new Date(now.getTime() - amount * milliseconds);
  }

  return null;
}

export function parseGermanDate(text: string): Date {
  const now = new Date();
  const trimmed = text.trim();

  if (!trimmed) {
    console.warn('  Could not parse empty date, using current time');
    return now;
  }

  const relativeDate = parseRelativeDate(trimmed, now);
  if (relativeDate) return relativeDate;

  // "Gestern" = yesterday
  if (/gestern/i.test(trimmed)) {
    return new Date(now.getTime() - ONE_DAY_MS);
  }

  // "Heute" = today
  if (/heute/i.test(trimmed)) {
    return now;
  }

  // Absolute date: "15. Januar 2024"
  const monthNameMatch = trimmed.match(/(\d{1,2})\.\s+([a-zäöüß]+)\s+(\d{4})/i);
  if (monthNameMatch) {
    const day = Number.parseInt(monthNameMatch[1], 10);
    const monthName = monthNameMatch[2].toLocaleLowerCase('de-DE');
    const year = Number.parseInt(monthNameMatch[3], 10);
    const month = CONFIG.GERMAN_MONTHS[monthName];

    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Numeric date: "15.01.2024"
  const numericMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (numericMatch) {
    const day = Number.parseInt(numericMatch[1], 10);
    const month = Number.parseInt(numericMatch[2], 10) - 1;
    const year = Number.parseInt(numericMatch[3], 10);
    return new Date(year, month, day);
  }

  // ISO date and all parsable browser formats
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  console.warn(`  Could not parse date "${trimmed}", using current time`);
  return now;
}
