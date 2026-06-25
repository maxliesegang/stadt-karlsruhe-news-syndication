/**
 * Shared hashing
 * Single source of truth for the MD5 hashing used both for stable article
 * identity (hash of the link) and for content-change detection (hash of the
 * extracted body).
 */

import { createHash } from 'node:crypto';

export function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}
