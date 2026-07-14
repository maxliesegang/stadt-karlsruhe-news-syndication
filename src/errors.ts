/**
 * Error helpers
 * Single source of truth for turning an unknown thrown value into a readable
 * message, used across fetch/scrape/extract error handling.
 */

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
