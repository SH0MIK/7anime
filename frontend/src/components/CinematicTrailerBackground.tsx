import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CinematicTrailerBackgroundProps {
  backdropUrl?: string | null;
  trailerKey?: string | null;
  title?: string;
}

export const CinematicTrailerBackground: React.FC<CinematicTrailerBackgroundProps> = ({
  backdropUrl,
  trailerKey,
  title,
}) => {
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Reset state when trailerKey changes
  useEffect(() => {
    setIsVideoVisible(false);
    setHasError(false);
  }, [trailerKey]);

  // Handle visibility change (pause video when tab is hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!iframeRef.current || !iframeRef.current.contentWindow) return;

      try {
        if (document.hidden) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
            '*'
          );
        } else if (isVideoVisible) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        }
      } catch {
        // Ignore cross-origin frame postMessage failures
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isVideoVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }),
            '*'
          );
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  const handleIframeLoad = useCallback(() => {
    // Delay fade-in slightly so YouTube's first frame renders before revealing
    const timer = setTimeout(() => {
      setIsVideoVisible(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedUrl = trailerKey && !hasError
    ? `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(origin)}`
    : null;

  return (
    <div
      className="detail-hero__bg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 560,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* 1. Static Backdrop Layer (Always present, zero layout shift) */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt={title ? `${title} backdrop` : ''}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 22%',
            opacity: 0.72,
            transition: 'opacity 0.6s ease',
          }}
        />
      )}

      {/* 2. Cinematic Trailer Video Layer */}
      {embedUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            opacity: isVideoVisible ? 1 : 0,
            transition: 'opacity 1.2s ease-in-out',
            pointerEvents: 'none',
          }}
        >
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={`${title || 'Anime'} Trailer`}
            allow="autoplay; encrypted-media"
            referrerPolicy="origin"
            onLoad={handleIframeLoad}
            onError={() => {
              setHasError(true);
              setIsVideoVisible(false);
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '120vw',
              height: '120vh',
              minWidth: '100%',
              minHeight: '100%',
              transform: 'translate(-50%, -50%) scale(1.15)',
              border: 0,
              pointerEvents: 'none',
              filter: 'brightness(0.92) contrast(1.05)',
            }}
          />
        </div>
      )}

      {/* 3. Cinematic Dark Gradient Vignette Overlay (Sits over video and image) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            linear-gradient(180deg, rgba(10, 10, 14, 0.28) 0%, rgba(10, 10, 14, 0.56) 56%, rgb(var(--c-bg, 10, 10, 14)) 100%),
            linear-gradient(90deg, rgba(10, 10, 14, 0.82) 0%, rgba(10, 10, 14, 0.35) 55%, rgba(10, 10, 14, 0.5) 100%)
          `,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
