/**
 * Extracts a Room ID from the current browser URL.
 * Supports:
 * - Query parameter: ?room=abc123
 * - Pathname: /room/abc123
 * - Direct path: /abc123
 */
export function getRoomIdFromCurrentUrl(): string | null {
  try {
    // 1. Search Query param
    const searchParams = new URLSearchParams(window.location.search);
    const fromQuery = searchParams.get('room');
    if (fromQuery && fromQuery.trim()) {
      return fromQuery.trim().toLowerCase();
    }

    // 2. Pathname
    const pathname = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (pathname) {
      const parts = pathname.split('/');
      if (parts[0] === 'room' && parts[1]) {
        return parts[1].trim().toLowerCase();
      }
      if (
        parts.length === 1 &&
        parts[0].length >= 3 &&
        !['room', 'assets', 'src', 'api', 'favicon.ico'].includes(parts[0].toLowerCase())
      ) {
        return parts[0].trim().toLowerCase();
      }
    }
  } catch (err) {
    console.warn('[URL] Error parsing room ID from URL:', err);
  }
  return null;
}

/**
 * Builds standard shareable invite URL.
 */
export function buildRoomInviteUrl(roomId: string): string {
  return `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
}
