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

  const cleanTrailerKey = trailerKey ? trailerKey.trim() : null;

  // Reset state when cleanTrailerKey changes
  useEffect(() => {
    setIsVideoVisible(false);
    setHasError(false);
  }, [cleanTrailerKey]);

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
    // Delay reveal slightly so YouTube's first frame renders before fading in
    const timer = setTimeout(() => {
      setIsVideoVisible(true);
    }, 300);

    return () => clearTimeout(timer);
  }, []);

  const embedUrl = cleanTrailerKey && !hasError
    ? `https://www.youtube-nocookie.com/embed/${cleanTrailerKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${cleanTrailerKey}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`
    : null;

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
            objectPosition: 'center 20%',
            opacity: isVideoVisible ? 0.35 : 0.95,
            transition: 'opacity 0.8s ease',
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
            transition: 'opacity 0.6s ease-in-out',
            pointerEvents: 'none',
          }}
        >
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title={`${title || 'Anime'} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            onLoad={handleIframeLoad}
            onError={() => {
              setHasError(true);
              setIsVideoVisible(false);
            }}
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
