import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './common/Logo';

export const BrandMark: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  return (
    <Link to="/" className="sitebar__brand" aria-label="7Anime Home" title="7Anime — More Than Anime">
      <Logo variant={compact ? 'mark' : 'full'} size={compact ? 'sm' : 'md'} priority />
    </Link>
  );
};

export const BrandFooterLockup: React.FC = () => {
  return (
    <Link to="/" className="brand-lockup flex items-center gap-2" aria-label="7Anime — More Than Anime" title="7Anime">
      <Logo variant="full" size="lg" />
    </Link>
  );
};

import type { AvatarDecorationId } from '../types/cosmetics';
import { AvatarDecorationRenderer } from './profile/AvatarDecorationRenderer';

interface AvatarBadgeProps {
  username: string;
  avatar?: string | null;
  color?: string;
  size?: number;
  frameStyle?: 'none' | 'crown' | 'celestial' | 'crimson' | 'neon' | string;
  decoration?: AvatarDecorationId | string;
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  username,
  avatar,
  color = '#43465a',
  size = 28,
  frameStyle = 'none',
  decoration,
}) => {
  const activeDecoration = decoration || (frameStyle && frameStyle !== 'none' ? frameStyle : 'none');
  const initial = (username?.trim()?.[0] ?? 'A').toUpperCase();

  return (
    <span
      className="avatar-badge-container"
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'visible',
      }}
    >
      <span
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'grid',
          placeItems: 'center',
          background: avatar ? '#191a20' : color,
          color: '#ffffff',
          fontSize: Math.max(10, Math.round(size * 0.42)),
          fontWeight: 700,
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={username}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          initial
        )}
      </span>
      {activeDecoration && activeDecoration !== 'none' && (
        <AvatarDecorationRenderer decoration={activeDecoration} size={size} />
      )}
    </span>
  );
};

export function formatTimeSec(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${mins}:${String(rem).padStart(2, '0')}`;
}
