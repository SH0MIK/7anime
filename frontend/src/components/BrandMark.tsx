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

interface AvatarBadgeProps {
  username: string;
  avatar?: string | null;
  color?: string;
  size?: number;
  frameStyle?: 'none' | 'crown' | 'celestial' | 'crimson' | 'neon';
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  username,
  avatar,
  color = '#43465a',
  size = 28,
  frameStyle = 'none',
}) => {
  const initial = (username?.trim()?.[0] ?? 'A').toUpperCase();
  const frameClass =
    frameStyle && frameStyle !== 'none' ? `avatar-frame-ring avatar-frame-ring--${frameStyle}` : '';

  return (
    <span
      className={frameClass}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
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
