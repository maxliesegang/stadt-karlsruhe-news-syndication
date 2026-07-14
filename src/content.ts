/**
 * Feed content preparation
 * Rewrites extracted article HTML so it renders in feed readers: resolves
 * lazy-loaded images to real sources, flattens <picture> markup, and turns
 * relative image/link URLs into absolute ones. Pure and side-effect free.
 */

import * as cheerio from 'cheerio';
import { resolveHttpUrl } from './url.js';

function isPlaceholderImage(value: string): boolean {
  return value.trimStart().startsWith('data:image/gif;base64,');
}

function normalizeContentUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();

  // Leave non-navigational schemes (data:, mailto:, anchors, …) untouched so
  // we don't break inline content; everything else is resolved to an absolute
  // http(s) URL, falling back to the original on failure.
  if (!trimmed || /^(data:|mailto:|tel:|javascript:|#)/i.test(trimmed)) {
    return trimmed;
  }

  return resolveHttpUrl(trimmed, baseUrl) ?? trimmed;
}

function firstSrcsetUrl(srcset: string): string {
  const firstCandidate = srcset.split(',')[0]?.trim();
  if (!firstCandidate) return '';
  return firstCandidate.split(/\s+/)[0] ?? '';
}

function normalizeSrcset(srcset: string, baseUrl: string): string {
  const trimmed = srcset.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;

  return trimmed
    .split(',')
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      if (parts.length === 0 || !parts[0]) return '';

      const [url, ...descriptor] = parts;
      const normalizedUrl = normalizeContentUrl(url, baseUrl);
      return [normalizedUrl, ...descriptor].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

// Promote lazy-loaded sources (data-src/data-srcset) onto the real attributes
// when the eager attribute is missing or a placeholder, then strip the loader
// hints so feed readers show the image immediately.
function promoteLazyImages($: cheerio.CheerioAPI): void {
  $('img').each((_, element) => {
    const img = $(element);
    const src = img.attr('src')?.trim() ?? '';
    const dataSrc = img.attr('data-src')?.trim() ?? '';
    const srcset = img.attr('srcset')?.trim() ?? '';
    const dataSrcset = img.attr('data-srcset')?.trim() ?? '';

    if (dataSrc && (!src || isPlaceholderImage(src))) {
      img.attr('src', dataSrc);
    }

    if (dataSrcset && (!srcset || isPlaceholderImage(srcset))) {
      img.attr('srcset', dataSrcset);
    }

    img.removeAttr('data-src');
    img.removeAttr('data-srcset');
    img.removeAttr('loading');
    img.removeAttr('decoding');
  });
}

// Replace each <picture> with its inner <img>, borrowing a <source> srcset URL
// when the img itself still lacks a usable src. Feed readers don't handle
// <picture>/<source> reliably, so a plain <img> is safer.
function flattenPictures($: cheerio.CheerioAPI): void {
  $('picture').each((_, element) => {
    const picture = $(element);
    const img = picture.find('img').first();

    if (img.length === 0) {
      picture.remove();
      return;
    }

    const src = img.attr('src')?.trim() ?? '';
    if (!src || isPlaceholderImage(src)) {
      const source = picture.find('source').first();
      const sourceSrcset =
        source.attr('data-srcset')?.trim() ?? source.attr('srcset')?.trim() ?? '';
      const sourceUrl = firstSrcsetUrl(sourceSrcset);
      if (sourceUrl) {
        img.attr('src', sourceUrl);
      }
    }

    picture.replaceWith(img);
  });
}

// Resolve remaining relative image and link URLs to absolute http(s) URLs so
// they still work once the content is rehosted in the feed.
function absolutizeUrls($: cheerio.CheerioAPI, articleUrl: string): void {
  $('img').each((_, element) => {
    const img = $(element);
    const src = img.attr('src')?.trim();
    const srcset = img.attr('srcset')?.trim();

    if (src) {
      img.attr('src', normalizeContentUrl(src, articleUrl));
    }
    if (srcset) {
      if (isPlaceholderImage(srcset)) {
        img.removeAttr('srcset');
      } else {
        img.attr('srcset', normalizeSrcset(srcset, articleUrl));
      }
    }
  });

  $('a[href]').each((_, element) => {
    const link = $(element);
    const href = link.attr('href')?.trim();
    if (href) {
      link.attr('href', normalizeContentUrl(href, articleUrl));
    }
  });
}

export function prepareContentForFeed(content: string, articleUrl: string): string {
  const $ = cheerio.load(content, null, false);

  promoteLazyImages($);
  flattenPictures($);
  absolutizeUrls($, articleUrl);

  return $.root().html()?.trim() ?? content.trim();
}
