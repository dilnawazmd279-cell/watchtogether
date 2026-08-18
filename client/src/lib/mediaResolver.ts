import { MediaSourceState } from '../types';

export type MovieSourceType = 'direct-media' | 'embeddable-page' | 'blocked-webpage';

export interface ResolvedMovieSource {
  url: string;
  embedUrl?: string;
  sourceType: MovieSourceType;
  title: string;
  isControllable: boolean;
  platform?: 'youtube' | 'vimeo' | 'twitch' | 'dailymotion' | 'generic';
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
 * Converts known media platforms to their official embed URLs.
 */
export function convertToEmbedUrl(url: string): { embedUrl: string; platform: 'youtube' | 'vimeo' | 'twitch' | 'dailymotion' | 'generic' } {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./i, '');

    // 1. YouTube
    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v) {
        return { embedUrl: `https://www.youtube.com/embed/${v}?autoplay=1&enablejsapi=1`, platform: 'youtube' };
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return { embedUrl: url, platform: 'youtube' };
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const shortId = parsed.pathname.split('/shorts/')[1]?.split('/')[0];
        if (shortId) {
          return { embedUrl: `https://www.youtube.com/embed/${shortId}?autoplay=1`, platform: 'youtube' };
        }
      }
    } else if (hostname === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (videoId) {
        return { embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`, platform: 'youtube' };
      }
    }

    // 2. Vimeo
    if (hostname === 'vimeo.com') {
      const vimeoId = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (vimeoId && /^\d+$/.test(vimeoId)) {
        return { embedUrl: `https://player.vimeo.com/video/${vimeoId}?autoplay=1`, platform: 'vimeo' };
      }
    } else if (hostname === 'player.vimeo.com') {
      return { embedUrl: url, platform: 'vimeo' };
    }

    // 3. Dailymotion
    if (hostname === 'dailymotion.com') {
      const parts = parsed.pathname.split('/video/');
      if (parts[1]) {
        const videoId = parts[1].split('?')[0];
        return { embedUrl: `https://www.dailymotion.com/embed/video/${videoId}`, platform: 'dailymotion' };
      }
    }

    // 4. Generic Webpage Embedding
    return { embedUrl: url, platform: 'generic' };
  } catch {
    return { embedUrl: url, platform: 'generic' };
  }
}

/**
 * Smart URL Router.
 * Step 1: Normalize and validate URL.
 * Step 2: Determine source type:
 *   A. DIRECT MEDIA (.mp4, .webm, .ogg, .m4v, direct video files)
 *   B. EMBEDDABLE WEBPAGE (YouTube, Vimeo, or legitimate embed attempts)
 *   C. BLOCKED WEBPAGE (Graceful fallback when embedding is prohibited)
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

  // B. EMBEDDABLE WEBPAGE
  const { embedUrl, platform } = convertToEmbedUrl(normalized);
  return {
    url: normalized,
    embedUrl,
    sourceType: 'embeddable-page',
    title: parsed.hostname.replace(/^www\./i, ''),
    isControllable: false,
    platform,
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
