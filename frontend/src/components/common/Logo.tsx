import React from 'react';

interface LogoProps {
  variant?: 'full' | 'mark' | 'compact';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  priority?: boolean;
}

/**
 * Official 7Anime brand logo component.
 * Renders the authentic "7Anime — More Than Anime" master artwork
 * or the iconic "7" mark for compact/mobile viewports.
 */
export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  priority = false,
}) => {
  const heights = {
    sm: 26,
    md: 34,
    lg: 46,
    xl: 60,
  }[size];

  if (variant === 'mark' || variant === 'compact') {
    return (
      <span
        className={`seven-logo-wrap seven-logo-wrap--mark inline-flex items-center justify-center select-none ${className}`}
        style={{ height: `${heights}px` }}
      >
        <img
          src="/assets/branding/7anime-mark.png"
          alt="7Anime"
          width={Math.round(heights * 0.93)}
          height={heights}
          className="seven-logo-img object-contain flex-shrink-0 transition-transform duration-200 hover:scale-105"
          style={{ height: `${heights}px`, width: 'auto', maxHeight: '100%' }}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      </span>
    );
  }

  // Full master logo lockup: "7ANIME — MORE THAN ANIME —" with planetary ring and stars
  const fullWidth = Math.round(heights * 2.34);

  return (
    <span
      className={`seven-logo-wrap seven-logo-wrap--full inline-flex items-center select-none ${className}`}
      style={{ height: `${heights}px` }}
    >
      <img
        src="/assets/branding/7anime-logo.png"
        alt="7Anime — More Than Anime"
        width={fullWidth}
        height={heights}
        className="seven-logo-img object-contain flex-shrink-0 transition-transform duration-200 hover:scale-[1.02]"
        style={{ height: `${heights}px`, width: 'auto', maxHeight: '100%' }}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    </span>
  );
};
