import React from 'react';
import { AlertTriangle, RefreshCw, SearchX } from 'lucide-react';

export const AnimeCardSkeleton: React.FC<{ variant?: 'grid' | 'rail' }> = ({ variant = 'grid' }) => {
  return (
    <div
      className={`cov ${variant === 'rail' ? 'cov--rail' : 'cov--grid'}`}
      style={{
        pointerEvents: 'none',
        animation: 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }}
    >
      <div
        className="cov-poster"
        style={{
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 12,
          aspectRatio: '2/3',
        }}
      />
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            height: 14,
            width: '85%',
            borderRadius: 4,
            background: 'rgba(255, 255, 255, 0.08)',
          }}
        />
        <div
          style={{
            height: 10,
            width: '50%',
            borderRadius: 4,
            background: 'rgba(255, 255, 255, 0.05)',
          }}
        />
      </div>
    </div>
  );
};

export const SpotlightSkeleton: React.FC = () => {
  return (
    <div
      className="spot"
      style={{
        minHeight: 520,
        background: 'rgba(15, 15, 22, 0.8)',
        borderRadius: 24,
        margin: '0 var(--pad) 28px',
        animation: 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '48px 40px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ height: 20, width: 120, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ height: 44, width: '80%', borderRadius: 8, background: 'rgba(255,255,255,0.12)' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ height: 24, width: 70, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ height: 24, width: 85, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ height: 24, width: 60, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }} />
        </div>
        <div style={{ height: 16, width: '95%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ height: 16, width: '70%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <div style={{ height: 44, width: 150, borderRadius: 999, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ height: 44, width: 120, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
        </div>
      </div>
    </div>
  );
};

export const RailSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="media-carousel" style={{ padding: '0 var(--pad)' }}>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(160px, 190px)', gap: 16, overflow: 'hidden' }}>
        {Array.from({ length: count }).map((_, i) => (
          <AnimeCardSkeleton key={i} variant="rail" />
        ))}
      </div>
    </div>
  );
};

export const GridSkeleton: React.FC<{ count?: number }> = ({ count = 18 }) => {
  return (
    <div className="browse-grid">
      {Array.from({ length: count }).map((_, i) => (
        <AnimeCardSkeleton key={i} variant="grid" />
      ))}
    </div>
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({
  title = 'Failed to load live data',
  message,
  onRetry,
}) => {
  return (
    <div
      style={{
        padding: '36px 24px',
        margin: '20px auto',
        maxWidth: 580,
        borderRadius: 16,
        background: 'rgba(239, 68, 68, 0.08)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <AlertTriangle size={32} color="#f87171" />
      <h3 style={{ margin: 0, fontSize: 18, color: '#fca5a5' }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255, 255, 255, 0.75)', maxWidth: 440 }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="watch-pill"
          aria-pressed="true"
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ffffff',
          }}
        >
          <RefreshCw size={14} />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
};

export const EmptyState: React.FC<{
  title?: string;
  message: string;
  onReset?: () => void;
  resetLabel?: string;
}> = ({
  title = 'No anime found',
  message,
  onReset,
  resetLabel = 'Reset Filters',
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        margin: '20px auto',
        maxWidth: 500,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <SearchX size={36} style={{ opacity: 0.4 }} />
      <h3 style={{ margin: 0, fontSize: 18, color: 'rgb(var(--c-text1, 255, 255, 255))' }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 13.5, color: 'rgb(var(--c-text2, 160, 160, 170))' }}>
        {message}
      </p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="watch-pill"
          aria-pressed="true"
          style={{ marginTop: 8 }}
        >
          <span>{resetLabel}</span>
        </button>
      )}
    </div>
  );
};
