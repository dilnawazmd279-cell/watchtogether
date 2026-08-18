import { MediaSourceState } from '../types';

export type MovieSourceType = 'direct-media' | 'supported-embed' | 'unsupported-webpage';

export interface ResolvedMovieSource {
  url: string;
  sourceType: MovieSourceType;
  title: string;
  isControllable: boolean;
  message?: string;
}

/**
 * Normalizes user-entered media URLs.
 * - Fixes duplicated protocols (e.g. https://https://example.com -> https://example.com)
 * - Prepends https:// only if no protocol exists
 * - Trims accidental whitespace
 * - Preserves query parameters, hashes, and signed tokens
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
 * Handles query parameters, hashes, and signed tokens (.mp4, .webm, .ogg, .m4v).
 */
export function isDirectMediaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const normalized = normalizeMediaUrl(url);
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.toLowerCase();

    return (
      /\.(mp4|webm|ogg|m4v|ogv)($|\?|#)/i.test(pathname) ||
      /\.(mp4|webm|ogg|m4v)($|\?|#)/i.test(parsed.href)
    );
  } catch {
    return false;
  }
}

/**
 * Smart URL Router.
 * Classifies a URL as:
 * A. DIRECT MEDIA: (.mp4, .webm, .ogg, .m4v, direct video files)
 * B. SUPPORTED EMBED: (specialized embed players)
 * C. UNSUPPORTED WEBPAGE: (protected/arbitrary websites that cannot be directly controlled inside HTML5 video)
 */
export function resolveMovieSource(input: string): ResolvedMovieSource {
  const normalized = normalizeMediaUrl(input);
  const parsed = new URL(normalized);
  const pathname = parsed.pathname.toLowerCase();

  // A. DIRECT MEDIA
  if (isDirectMediaUrl(normalized)) {
    const filename = pathname.split('/').filter(Boolean).pop() || 'Direct Video';
    return {
      url: normalized,
      sourceType: 'direct-media',
      title: decodeURIComponent(filename.split('?')[0]),
      isControllable: true,
    };
  }

  // C. UNSUPPORTED WEBPAGE
  return {
    url: normalized,
    sourceType: 'unsupported-webpage',
    title: parsed.hostname.replace(/^www\./i, ''),
    isControllable: false,
    message: "That movie site can't be controlled directly here. Try a direct video link (.mp4) or a supported player.",
  };
}

/**
 * Compatibility adapter for MediaSourceState
 */
export function loadMovieFromUrl(input: string): MediaSourceState {
  const resolved = resolveMovieSource(input);
  return {
    url: resolved.url,
    type: resolved.sourceType === 'direct-media' ? 'direct-video' : 'webpage',
    title: resolved.title,
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
  };
}

export const resolveMediaUrl = loadMovieFromUrl;
