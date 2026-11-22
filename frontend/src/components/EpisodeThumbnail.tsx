import React, { useState } from 'react';

export interface EpisodeThumbnailProps {
  src?: string | null;
  alt?: string;
  episodeNumber: number;
  hideThumbs?: boolean;
  className?: string;
  loading?: 'lazy' | 'eager';
  style?: React.CSSProperties;
  fontSize?: number;
  wrapInPlaceholderDiv?: boolean;
  customFallback?: (episodeNumber: number) => React.ReactNode;
}

export const EpisodeThumbnail: React.FC<EpisodeThumbnailProps> = ({
  src,
  alt = '',
  episodeNumber,
  hideThumbs = false,
  className,
  loading = 'lazy',
  style,
  fontSize = 28,
  wrapInPlaceholderDiv = false,
  customFallback,
}) => {
  const [hasError, setHasError] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  if (src !== prevSrc) {
    setPrevSrc(src);
    setHasError(false);
  }

  // If hidden, missing src, or failed to load, display the designed episode-number badge
  if (hideThumbs || !src || hasError) {
    if (customFallback) {
      return <>{customFallback(episodeNumber)}</>;
    }
    const badge = (
      <span className="cw-placeholder-number" style={{ fontSize }}>
        {String(episodeNumber).padStart(2, '0')}
      </span>
    );
    return wrapInPlaceholderDiv ? <div className="cw-placeholder">{badge}</div> : badge;
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setHasError(true)}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        ...style,
      }}
    />
  );
};
