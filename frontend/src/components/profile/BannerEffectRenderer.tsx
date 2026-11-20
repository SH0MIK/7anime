import React, { useMemo } from 'react';
import type { BannerEffectId } from '../../types/cosmetics';

interface BannerEffectRendererProps {
  effect?: BannerEffectId | string;
  className?: string;
  style?: React.CSSProperties;
}

const CONFETTI_COLORS = ['#f43f5e', '#38bdf8', '#fbbf24', '#a855f7', '#4ade80', '#fb923c'];
const CODE_GLYPHS = ['7', 'A', 'N', 'I', 'M', 'E', '1', '0', '日', '本', '語', '龍', '星'];

/**
 * Standard particle configurations (deterministic, lightweight, no layout shifts)
 */
const DEFAULT_PARTICLES = [
  { x: '6%', y: '22%', dx: '26px', d: '7.5s', delay: '-1s', s: '9px', color: '#fbbf24' },
  { x: '18%', y: '58%', dx: '-18px', d: '8.8s', delay: '-3s', s: '7px', color: '#f43f5e' },
  { x: '32%', y: '32%', dx: '32px', d: '6.8s', delay: '-2s', s: '10px', color: '#38bdf8' },
  { x: '46%', y: '72%', dx: '-28px', d: '8.2s', delay: '-4s', s: '8px', color: '#4ade80' },
  { x: '60%', y: '18%', dx: '22px', d: '7.2s', delay: '-1.5s', s: '9px', color: '#a855f7' },
  { x: '74%', y: '64%', dx: '-24px', d: '9.4s', delay: '-5s', s: '7px', color: '#fb923c' },
  { x: '88%', y: '36%', dx: '18px', d: '8.0s', delay: '-2.5s', s: '10px', color: '#ec4899' },
  { x: '96%', y: '80%', dx: '-16px', d: '7.8s', delay: '-3.8s', s: '8px', color: '#facc15' },
];

export const BannerEffectRenderer: React.FC<BannerEffectRendererProps> = ({
  effect = 'none',
  className = '',
  style,
}) => {
  if (!effect || effect === 'none') {
    return null;
  }

  // Normalize legacy names
  const activeEffect: BannerEffectId =
    effect === 'snow' ? 'snowfall' : effect === 'stars' ? 'night_sky' : (effect as BannerEffectId);

  return (
    <div
      className={`bfx bfx--${activeEffect} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {activeEffect === 'aurora' ? null : (
        DEFAULT_PARTICLES.map((p, idx) => {
          const glyph =
            activeEffect === 'code_rain'
              ? CODE_GLYPHS[idx % CODE_GLYPHS.length]
              : undefined;

          const particleColor =
            activeEffect === 'confetti'
              ? CONFETTI_COLORS[idx % CONFETTI_COLORS.length]
              : p.color;

          return (
            <i
              key={idx}
              style={{
                ['--x' as string]: p.x,
                ['--y' as string]: p.y,
                ['--dx' as string]: p.dx,
                ['--d' as string]: p.d,
                ['--delay' as string]: p.delay,
                ['--s' as string]: p.s,
                ['--color' as string]: particleColor,
              }}
            >
              {glyph}
            </i>
          );
        })
      )}
    </div>
  );
};
