/**
 * YouTube Trailer Helper & Singleton IFrame API Loader for 7Anime
 */

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          videoId?: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, any>;
          events?: {
            onReady?: (event: any) => void;
            onStateChange?: (event: any) => void;
            onError?: (event: any) => void;
          };
        }
      ) => any;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Module-level negative cache of failed trailer keys (persists across component lifecycles in the session)
const failedTrailersSet = new Set<string>();

/**
 * Validates and extracts the 11-character YouTube video ID from various formats
 * (e.g. raw ID, full watch URL, short URL, embed URL).
 */
export function extractYouTubeVideoId(input?: string | null): string | null {
  if (!input) return null;
  const str = input.trim();
  if (!str) return null;

  // Direct 11-character alphanumeric with dashes/underscores
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // Common YouTube URL formats:
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
  // https://www.youtube-nocookie.com/embed/VIDEO_ID
  const urlMatch = str.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/
  );
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  return null;
}

/**
 * Checks whether a trailer key has previously failed.
 */
export function isTrailerKeyFailed(key: string): boolean {
  return failedTrailersSet.has(key);
}

/**
 * Marks a trailer key as failed in the negative cache to prevent repeated requests.
 */
export function markTrailerKeyFailed(key: string): void {
  failedTrailersSet.add(key);
}

/**
 * Clears the negative cache (useful for testing or manual retries).
 */
export function clearFailedTrailersCache(): void {
  failedTrailersSet.clear();
}

/**
 * Human-readable descriptions for YouTube IFrame Player API error codes.
 */
export const YOUTUBE_ERROR_DESCRIPTIONS: Record<number, string> = {
  2: 'The request contains an invalid parameter value (invalid video ID).',
  5: 'The requested content cannot be played in an HTML5 player.',
  100: 'The video requested was not found (removed or marked private).',
  101: 'The owner of the requested video does not allow it to be played in embedded players.',
  150: 'The owner of the requested video does not allow it to be played in embedded players (restricted).',
  153: 'Embedded playback is blocked by YouTube policy or restriction.',
};

let ytApiPromise: Promise<void> | null = null;

/**
 * Loads the YouTube IFrame Player API script as a singleton with a safety timeout.
 */
export function loadYouTubeIframeApi(timeoutMs = 6000): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is undefined (SSR environment).'));
  }

  // 1. If already available on window, resolve immediately
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  // 2. If already loading, return existing promise
  if (ytApiPromise) {
    return ytApiPromise;
  }

  ytApiPromise = new Promise<void>((resolve, reject) => {
    let timer: any = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
    };

    // Timeout safety in case script load hangs or is silently blocked by adblockers/network
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`YouTube IFrame API script load timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    // Save any existing callback
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      cleanup();
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {
          // Ignore
        }
      }
      resolve();
    };

    // If script tag already exists in DOM, wait for ready
    const existingScript = document.getElementById('youtube-iframe-api');
    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'youtube-iframe-api';
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error('Failed to load YouTube IFrame API script (network error or blocked).'));
    };

    document.head.appendChild(script);
  }).catch((err) => {
    // Reset so next attempt can retry if needed
    ytApiPromise = null;
    throw err;
  });

  return ytApiPromise;
}
