/**
 * URL helpers shared across scraping and feed generation.
 */

/**
 * Resolve a possibly-relative URL against a base and return its absolute href,
 * or `null` if it is empty, malformed, or not an http(s) URL.
 */
export function resolveHttpUrl(value: string, baseUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}
