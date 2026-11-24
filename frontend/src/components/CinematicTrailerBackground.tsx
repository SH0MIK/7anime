import React, { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react';
import {
  extractYouTubeVideoId,
  isTrailerKeyFailed,
  markTrailerKeyFailed,
  loadYouTubeIframeApi,
  YOUTUBE_ERROR_DESCRIPTIONS,
} from '@/src/utils/youtubeTrailer';

export type TrailerState = 'artwork' | 'trailer-loading' | 'trailer-playing' | 'trailer-failed';

interface CinematicTrailerBackgroundProps {
  backdropUrl?: string | null;
  posterUrl?: string | null;
  trailerKey?: string | null;
  title?: string;
}

export const CinematicTrailerBackground: React.FC<CinematicTrailerBackgroundProps> = ({
  backdropUrl,
  posterUrl,
  trailerKey,
  title,
}) => {
  const instanceId = useId().replace(/:/g, '_');
  const playerId = `yt_hero_player_${instanceId}`;

  // Validate and extract genuine 11-char YouTube ID
  const validVideoId = useMemo(() => extractYouTubeVideoId(trailerKey), [trailerKey]);

  // Determine initial trailer state
  const [trailerState, setTrailerState] = useState<TrailerState>(() => {
    if (!validVideoId || isTrailerKeyFailed(validVideoId)) {
      return 'artwork';
    }
    return 'trailer-loading';
  });

  // Track artwork fallback levels: Priority 1 (backdrop) -> Priority 2 (poster) -> Priority 3 (safe gradient)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(() => backdropUrl || posterUrl || null);
  const [artworkLoadFailed, setArtworkLoadFailed] = useState<boolean>(false);

  useEffect(() => {
    setArtworkUrl(backdropUrl || posterUrl || null);
    setArtworkLoadFailed(false);
  }, [backdropUrl, posterUrl]);

  const handleArtworkError = useCallback(() => {
    if (artworkUrl === backdropUrl && posterUrl && posterUrl !== backdropUrl) {
      // Fallback from Priority 1 (backdrop) to Priority 2 (poster)
      setArtworkUrl(posterUrl);
    } else {
      // Fallback from Priority 2 (poster) to Priority 3 (safe visual vignette)
      setArtworkLoadFailed(true);
      setArtworkUrl(null);
    }
  }, [artworkUrl, backdropUrl, posterUrl]);

  // Respect system reduced-motion preference
  const prefersReducedMotion = useMemo(() => {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  const playerRef = useRef<any>(null);
  const playbackTimeoutRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string | null>(null);

  // Failure handler that transitions state, marks the key as failed, and destroys player
  const handleFailure = useCallback(
    (reason: string | number) => {
      const errorMsg =
        typeof reason === 'number'
          ? YOUTUBE_ERROR_DESCRIPTIONS[reason] || `Code ${reason}`
          : reason;

      if (Boolean((import.meta as any).env?.DEV)) {
        console.warn(
          `[CinematicTrailerBackground] Trailer playback unavailable for "${title || 'anime'}" (${validVideoId}): ${errorMsg}. Falling back to artwork.`
        );
      }

      if (validVideoId) {
        markTrailerKeyFailed(validVideoId);
      }

      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }

      if (playerRef.current) {
        try {
          playerRef.current.destroy?.();
        } catch {
          // Ignore destruction errors
        }
        playerRef.current = null;
      }

      setTrailerState('trailer-failed');
    },
    [validVideoId, title]
  );

  // Initialize and manage YouTube IFrame Player lifecycle
  useEffect(() => {
    // If anime or trailer changed, cleanup existing player
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.destroy?.();
      } catch {
        // Ignore
      }
      playerRef.current = null;
    }

    currentVideoIdRef.current = validVideoId;

    // If no trailer, invalid ID, or already known to have failed, keep artwork visible
    if (!validVideoId || isTrailerKeyFailed(validVideoId)) {
      setTrailerState('artwork');
      return;
    }

    let isCancelled = false;
    setTrailerState('trailer-loading');

    // Safety timeout: If playback never reaches PLAYING state within 7 seconds, fallback to artwork
    playbackTimeoutRef.current = setTimeout(() => {
      if (!isCancelled && currentVideoIdRef.current === validVideoId) {
        handleFailure('Playback initialization timed out (7s)');
      }
    }, 7000);

    // Load singleton YouTube IFrame API and mount player
    loadYouTubeIframeApi(5000)
      .then(() => {
        if (isCancelled || currentVideoIdRef.current !== validVideoId) {
          return;
        }

        const containerEl = document.getElementById(playerId);
        if (!containerEl || !window.YT?.Player) {
          handleFailure('Target DOM container or YT.Player unavailable');
          return;
        }

        playerRef.current = new window.YT.Player(playerId, {
          videoId: validVideoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            loop: 1,
            playlist: validVideoId,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              if (isCancelled || currentVideoIdRef.current !== validVideoId) return;
              try {
                event.target.mute?.();
                event.target.playVideo?.();
              } catch (err) {
                handleFailure('playVideo invocation failed');
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled || currentVideoIdRef.current !== validVideoId) return;
              // 1 = YT.PlayerState.PLAYING
              if (event.data === 1) {
                if (playbackTimeoutRef.current) {
                  clearTimeout(playbackTimeoutRef.current);
                  playbackTimeoutRef.current = null;
                }
                setTrailerState('trailer-playing');
              }
            },
            onError: (event: any) => {
              if (isCancelled || currentVideoIdRef.current !== validVideoId) return;
              // Handles codes 2, 5, 100, 101, 150, 153 etc.
              handleFailure(event.data);
            },
          },
        });
      })
      .catch((err) => {
        if (!isCancelled && currentVideoIdRef.current === validVideoId) {
          handleFailure(err instanceof Error ? err.message : 'API script load failed');
        }
      });

    return () => {
      isCancelled = true;
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy?.();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [validVideoId, playerId, handleFailure]);

  // Tab visibility change listener: pause when tab is inactive, resume if playing
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!playerRef.current) return;
      try {
        if (document.hidden) {
          playerRef.current.pauseVideo?.();
        } else if (trailerState === 'trailer-playing') {
          playerRef.current.playVideo?.();
        }
      } catch {
        // Ignore cross-origin issues
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [trailerState]);

  // Message listener for additional iframe postMessage error detection
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data && data.event === 'onError' && data.info !== undefined) {
          handleFailure(data.info);
        }
      } catch {
        // Ignore non-JSON postMessage events
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [handleFailure]);

  const isTrailerPlaying = trailerState === 'trailer-playing';
  const shouldRenderPlayer = Boolean(validVideoId && !isTrailerKeyFailed(validVideoId) && trailerState !== 'trailer-failed');

  return (
    <div
      className="detail-hero__bg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--detail-hero-h, clamp(660px, 74vh, 780px))',
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        WebkitMaskImage:
          'linear-gradient(to bottom, #000000 0%, #000000 55%, rgba(0, 0, 0, 0.96) 68%, rgba(0, 0, 0, 0.78) 78%, rgba(0, 0, 0, 0.45) 88%, rgba(0, 0, 0, 0.12) 95%, transparent 100%)',
        maskImage:
          'linear-gradient(to bottom, #000000 0%, #000000 55%, rgba(0, 0, 0, 0.96) 68%, rgba(0, 0, 0, 0.78) 78%, rgba(0, 0, 0, 0.45) 88%, rgba(0, 0, 0, 0.12) 95%, transparent 100%)',
      }}
    >
      {/* 1. Static Artwork Layer (Always present, zero layout shift, seamless fallback) */}
      {artworkUrl && !artworkLoadFailed && (
        <img
          src={artworkUrl}
          alt={title ? `${title} backdrop` : ''}
          onError={handleArtworkError}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 20%',
            opacity: isTrailerPlaying ? 0.35 : 0.95,
            transition: prefersReducedMotion ? 'none' : 'opacity 0.8s ease',
          }}
        />
      )}

      {/* 2. Cinematic Trailer Video Layer (Only revealed when genuinely playing) */}
      {shouldRenderPlayer && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            opacity: isTrailerPlaying ? 1 : 0,
            visibility: isTrailerPlaying ? 'visible' : 'hidden',
            transition: prefersReducedMotion ? 'none' : 'opacity 0.6s ease-in-out',
            pointerEvents: 'none',
          }}
        >
          <div
            id={playerId}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 'max(100%, calc(var(--detail-hero-h, 680px) * 1.778))',
              height: 'max(var(--detail-hero-h, 680px), 56.25vw)',
              transform: 'translate(-50%, -50%)',
              border: 0,
              pointerEvents: 'none',
              filter: 'contrast(1.02) saturate(1.04)',
            }}
          />
        </div>
      )}

      {/* 3. Cinematic Dark Gradient Vignette Overlay (Sits over video and image) */}
      <div className="detail-hero__overlay" />
    </div>
  );
};
