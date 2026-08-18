import { MediaSourceState } from '../types';

/**
 * Normalizes user-entered media URLs.
 * - Fixes duplicated protocols (e.g. https://https://example.com -> https://example.com)
 * - Prepends https:// only if no protocol exists
 * - Trims accidental whitespace
 * - Preserves query parameters and hashes
 * - Validates format with new URL()
 */
export function normalizeMediaUrl(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Please enter a video URL.');
  }

  let clean = input.trim();
  if (!clean) {
    throw new Error('Please enter a video URL.');
  }

  // Fix duplicated protocol prefixes (e.g. https://https:// or http://https://)
  clean = clean.replace(/^(?:https?:\/\/)+(https?:\/\/)/i, '$1');

  // If no protocol at all, prepend https://
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'https://' + clean;
  }

  // Validate format
  try {
    const parsed = new URL(clean);
    return parsed.href;
  } catch {
    throw new Error('Invalid URL format. Please enter a valid web link.');
  }
}

/**
 * Checks whether a URL points to a direct browser-playable media resource.
 * Handles query parameters and hashes (e.g. video.mp4?token=123#t=10).
 */
export function isDirectMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const normalized = normalizeMediaUrl(url);
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.toLowerCase();

    return (
      /\.(mp4|webm|ogg|m4v|ogv|m3u8)($|\?|#)/i.test(pathname) ||
      /\.(mp4|webm|ogg|m4v)($|\?|#)/i.test(parsed.href)
    );
  } catch {
    return false;
  }
}

/**
 * Single media URL router.
 * - Direct media files (.mp4, .webm, .ogg, .m4v) -> 'direct-video'
 * - Arbitrary website pages (netflix, net27, streaming sites) -> 'webpage'
 */
export function loadMovieFromUrl(input: string): MediaSourceState {
  const normalized = normalizeMediaUrl(input);
  const parsed = new URL(normalized);
  const pathname = parsed.pathname.toLowerCase();

  // TYPE 1: Direct media files
  if (isDirectMediaUrl(normalized)) {
    const filename = pathname.split('/').filter(Boolean).pop() || 'Direct Video';
    return {
      url: normalized,
      type: 'direct-video',
      title: filename.split('?')[0],
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now(),
    };
  }

  // TYPE 2: Arbitrary website / Movie player webpage
  return {
    url: normalized,
    type: 'webpage',
    title: parsed.hostname.replace(/^www\./i, ''),
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
  };
}

export const resolveMediaUrl = loadMovieFromUrl;
