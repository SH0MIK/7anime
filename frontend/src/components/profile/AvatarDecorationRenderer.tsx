import React from 'react';
import type { AvatarDecorationId } from '../../types/cosmetics';

interface AvatarDecorationRendererProps {
  decoration?: AvatarDecorationId | string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * High-fidelity vector renderer for all 24 Avatar Decorations.
 * Perfectly framed around any avatar diameter using normalized SVG coordinates.
 */
export const AvatarDecorationRenderer: React.FC<AvatarDecorationRendererProps> = ({
  decoration = 'none',
  size = 40,
  className = '',
  style,
}) => {
  if (!decoration || decoration === 'none') {
    return null;
  }

  // Normalize legacy frameStyle names
  const activeId: AvatarDecorationId =
    decoration === 'crown'
      ? 'royal_crown'
      : decoration === 'celestial'
        ? 'starlight'
        : decoration === 'crimson'
          ? 'devil_horns'
          : decoration === 'neon'
            ? 'neon_halo'
            : (decoration as AvatarDecorationId);

  return (
    <div
      className={`avatar-decor-wrapper avatar-decor--${activeId} ${className}`}
      style={{
        position: 'absolute',
        top: '-20%',
        left: '-20%',
        width: '140%',
        height: '140%',
        pointerEvents: 'none',
        zIndex: 2,
        overflow: 'visible',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Neon Halo Gradients */}
          <linearGradient id="neonHaloGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f5ff" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>

          {/* Ember Flame Gradient */}
          <linearGradient id="emberFlameGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="60%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>

          {/* Gold Laurel Gradient */}
          <linearGradient id="goldLaurelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>

          {/* Starlight Gradient */}
          <linearGradient id="starlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c084fc" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>

          {/* Frostbite Gradient */}
          <linearGradient id="frostbiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Jade Dragon Gradient */}
          <linearGradient id="jadeDragonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>

          {/* Glow Filters */}
          <filter id="glowFilterSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. NEON HALO */}
        {activeId === 'neon_halo' && (
          <g className="decor-anim-spin">
            <circle
              cx="50"
              cy="50"
              r="36.5"
              stroke="url(#neonHaloGrad)"
              strokeWidth="3.2"
              strokeDasharray="90 25 60 30"
              filter="url(#glowFilterSoft)"
            />
            <circle cx="50" cy="50" r="37.5" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
            <circle cx="23" cy="24" r="1.8" fill="#00f5ff" />
            <circle cx="77" cy="76" r="1.8" fill="#f43f5e" />
          </g>
        )}

        {/* 2. EMBER CROWN */}
        {activeId === 'ember_crown' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#f97316" strokeWidth="2.5" opacity="0.75" />
            <path
              d="M32 20 L37 8 L44 17 L50 4 L56 17 L63 8 L68 20 Q50 16 32 20 Z"
              fill="url(#emberFlameGrad)"
              filter="url(#glowFilterSoft)"
            />
            {/* Ember Sparks */}
            <circle cx="48" cy="2" r="1.2" fill="#fef08a" opacity="0.9" />
            <circle cx="34" cy="6" r="1" fill="#f97316" opacity="0.8" />
            <circle cx="66" cy="6" r="1" fill="#f97316" opacity="0.8" />
          </g>
        )}

        {/* 3. SAKURA DRIFT */}
        {activeId === 'sakura_drift' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#f472b6" strokeWidth="2.2" opacity="0.7" />
            {/* Cluster of 3 sakura blossoms at top-left curve */}
            <g transform="translate(22, 14) scale(0.9)">
              {/* Petals 1 */}
              <circle cx="5" cy="5" r="4" fill="#fbcfe8" stroke="#f472b6" strokeWidth="0.8" />
              <circle cx="2" cy="7" r="3.2" fill="#f472b6" opacity="0.8" />
              <circle cx="8" cy="7" r="3.2" fill="#f472b6" opacity="0.8" />
              <circle cx="5" cy="5" r="1.5" fill="#fda4af" />
            </g>
            <g transform="translate(14, 25) scale(0.7)">
              <circle cx="5" cy="5" r="4" fill="#fbcfe8" stroke="#f472b6" strokeWidth="0.8" />
              <circle cx="5" cy="5" r="1.5" fill="#fda4af" />
            </g>
            <g transform="translate(32, 11) scale(0.65)">
              <circle cx="5" cy="5" r="4" fill="#fdf2f8" stroke="#f472b6" strokeWidth="0.8" />
            </g>
            {/* Small drifting petal at bottom right */}
            <path
              d="M78 72 C82 70 85 75 80 77 C77 79 74 74 78 72 Z"
              fill="#f472b6"
              opacity="0.8"
            />
          </g>
        )}

        {/* 4. FROSTBITE */}
        {activeId === 'frostbite' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="url(#frostbiteGrad)" strokeWidth="2.8" />
            {/* Ice Spikes radiating out */}
            <path d="M50 14 L48 8 L50 4 L52 8 Z" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="0.6" />
            <path d="M50 86 L48 92 L50 96 L52 92 Z" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="0.6" />
            <path d="M14 50 L8 48 L4 50 L8 52 Z" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="0.6" />
            <path d="M86 50 L92 48 L96 50 L92 52 Z" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="0.6" />
            <path d="M25 25 L21 21 L23 18 L26 21 Z" fill="#e0f2fe" />
            <path d="M75 25 L79 21 L77 18 L74 21 Z" fill="#e0f2fe" />
            <path d="M25 75 L21 79 L18 77 L21 74 Z" fill="#e0f2fe" />
            <path d="M75 75 L79 79 L82 77 L79 74 Z" fill="#e0f2fe" />
          </g>
        )}

        {/* 5. LUCKY CLOVER */}
        {activeId === 'lucky_clover' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#22c55e" strokeWidth="2.4" opacity="0.8" />
            {/* 4-Leaf Clover Top Right */}
            <g transform="translate(74, 18) scale(0.8)">
              <circle cx="4" cy="2" r="2.8" fill="#4ade80" />
              <circle cx="8" cy="4" r="2.8" fill="#22c55e" />
              <circle cx="4" cy="8" r="2.8" fill="#16a34a" />
              <circle cx="2" cy="4" r="2.8" fill="#4ade80" />
              <path d="M5 5 Q3 12 1 14" stroke="#15803d" strokeWidth="1" fill="none" />
            </g>
            {/* Small Clover Bottom Left */}
            <g transform="translate(16, 70) scale(0.65)">
              <circle cx="4" cy="2" r="2.8" fill="#4ade80" />
              <circle cx="8" cy="4" r="2.8" fill="#22c55e" />
              <circle cx="4" cy="8" r="2.8" fill="#16a34a" />
              <circle cx="2" cy="4" r="2.8" fill="#4ade80" />
            </g>
          </g>
        )}

        {/* 6. THUNDERSTRIKE */}
        {activeId === 'thunderstrike' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#0ea5e9" strokeWidth="2" opacity="0.65" />
            {/* Lightning bolts */}
            <path
              d="M48 6 L54 18 L46 20 L56 34 L47 21 L53 19 Z"
              fill="#38bdf8"
              filter="url(#glowFilterSoft)"
            />
            <path
              d="M80 38 L88 46 L82 48 L92 58 L85 49 L89 47 Z"
              fill="#bae6fd"
              filter="url(#glowFilterSoft)"
            />
            <path
              d="M16 54 L10 64 L16 66 L8 78 L14 67 L10 65 Z"
              fill="#38bdf8"
              filter="url(#glowFilterSoft)"
            />
          </g>
        )}

        {/* 7. HEARTBEAT */}
        {activeId === 'heartbeat' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#f43f5e" strokeWidth="2.5" />
            {/* EKG Heart line and small heart icon */}
            <path
              d="M14 68 L32 68 L36 60 L40 76 L44 62 L48 70 L62 70"
              stroke="#fb7185"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              filter="url(#glowFilterSoft)"
            />
            <g transform="translate(68, 62) scale(0.7)">
              <path
                d="M10 5 C7 1 1 3 1 8 C1 13 10 18 10 18 C10 18 19 13 19 8 C19 3 13 1 10 5 Z"
                fill="#f43f5e"
              />
            </g>
          </g>
        )}

        {/* 8. NEKO EARS */}
        {activeId === 'neko_ears' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#c084fc" strokeWidth="2" opacity="0.7" />
            {/* Left Cat Ear */}
            <polygon points="24,18 20,4 35,12" fill="#1e1b4b" stroke="#a855f7" strokeWidth="1.2" />
            <polygon points="24,16 22,7 32,12" fill="#f472b6" />
            {/* Right Cat Ear */}
            <polygon points="76,18 80,4 65,12" fill="#1e1b4b" stroke="#a855f7" strokeWidth="1.2" />
            <polygon points="76,16 78,7 68,12" fill="#f472b6" />
          </g>
        )}

        {/* 9. VICTORY LAUREL */}
        {activeId === 'victory_laurel' && (
          <g>
            {/* Golden Laurel Wreath framing bottom & sides */}
            <g fill="url(#goldLaurelGrad)" filter="url(#glowFilterSoft)">
              {/* Left branch leaves */}
              <ellipse cx="20" cy="42" rx="4" ry="2" transform="rotate(-40 20 42)" />
              <ellipse cx="16" cy="54" rx="4.5" ry="2.2" transform="rotate(-15 16 54)" />
              <ellipse cx="18" cy="67" rx="5" ry="2.5" transform="rotate(20 18 67)" />
              <ellipse cx="26" cy="78" rx="5" ry="2.5" transform="rotate(45 26 78)" />
              <ellipse cx="37" cy="85" rx="5" ry="2.5" transform="rotate(70 37 85)" />
              {/* Right branch leaves */}
              <ellipse cx="80" cy="42" rx="4" ry="2" transform="rotate(40 80 42)" />
              <ellipse cx="84" cy="54" rx="4.5" ry="2.2" transform="rotate(15 84 54)" />
              <ellipse cx="82" cy="67" rx="5" ry="2.5" transform="rotate(-20 82 67)" />
              <ellipse cx="74" cy="78" rx="5" ry="2.5" transform="rotate(-45 74 78)" />
              <ellipse cx="63" cy="85" rx="5" ry="2.5" transform="rotate(-70 63 85)" />
              {/* Center bow tie */}
              <circle cx="50" cy="87" r="2.8" />
            </g>
          </g>
        )}

        {/* 10. STARLIGHT */}
        {activeId === 'starlight' && (
          <g>
            <circle
              cx="50"
              cy="50"
              r="36"
              stroke="url(#starlightGrad)"
              strokeWidth="2.6"
              filter="url(#glowFilterSoft)"
            />
            {/* 4 Point Stars at corners */}
            {/* Top-Right */}
            <path
              d="M76 18 Q76 22 80 22 Q76 22 76 26 Q76 22 72 22 Q76 22 76 18 Z"
              fill="#ffffff"
            />
            {/* Top-Left */}
            <path
              d="M24 22 Q24 25 27 25 Q24 25 24 28 Q24 25 21 25 Q24 25 24 22 Z"
              fill="#38bdf8"
            />
            {/* Bottom-Right */}
            <path
              d="M78 74 Q78 77 81 77 Q78 77 78 80 Q78 77 75 77 Q78 77 78 74 Z"
              fill="#e879f9"
            />
            {/* Bottom-Left */}
            <path
              d="M22 76 Q22 80 26 80 Q22 80 22 84 Q22 80 18 80 Q22 80 22 76 Z"
              fill="#ffffff"
            />
          </g>
        )}

        {/* 11. PUMPKIN NIGHT */}
        {activeId === 'pumpkin_night' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#ea580c" strokeWidth="2.5" opacity="0.8" />
            {/* Left Jack-o-Lantern */}
            <g transform="translate(13, 67) scale(0.9)">
              <ellipse cx="9" cy="9" rx="8" ry="7" fill="#ea580c" stroke="#c2410c" strokeWidth="0.8" />
              <polygon points="6,7 8,9 6,9" fill="#fef08a" />
              <polygon points="12,7 10,9 12,9" fill="#fef08a" />
              <path d="M5 12 Q9 15 13 12" stroke="#fef08a" strokeWidth="1.2" fill="none" />
              <rect x="8" y="1" width="2" height="3" fill="#15803d" />
            </g>
            {/* Right Spooky Bat */}
            <path
              d="M72 20 Q76 16 80 19 Q82 22 78 24 Q76 21 72 20 Z"
              fill="#312e81"
            />
          </g>
        )}

        {/* 12. FROSTY HAT */}
        {activeId === 'frosty_hat' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#bae6fd" strokeWidth="2.2" opacity="0.85" />
            {/* Santa Hat perched at top */}
            <g transform="translate(26, 4) rotate(-8 24 10)">
              {/* Red cone */}
              <path d="M4 14 Q22 0 42 12 Q38 15 4 14 Z" fill="#ef4444" />
              {/* White fur trim */}
              <rect x="2" y="12" width="42" height="6.5" rx="3.2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.6" />
              {/* White pom-pom */}
              <circle cx="43" cy="11" r="4.2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.6" />
            </g>
          </g>
        )}

        {/* 13. SPRING BLOOM */}
        {activeId === 'spring_bloom' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#4ade80" strokeWidth="2" opacity="0.6" />
            {/* Flower garland wrapping around avatar */}
            <circle cx="28" cy="18" r="3.5" fill="#f472b6" />
            <circle cx="42" cy="14" r="3" fill="#fbbf24" />
            <circle cx="58" cy="14" r="3.2" fill="#c084fc" />
            <circle cx="72" cy="18" r="3.5" fill="#f472b6" />
            <circle cx="82" cy="34" r="3" fill="#60a5fa" />
            <circle cx="85" cy="52" r="3.2" fill="#fbbf24" />
            <circle cx="82" cy="68" r="3" fill="#f472b6" />
            <circle cx="70" cy="80" r="3.5" fill="#a78bfa" />
            <circle cx="50" cy="86" r="3" fill="#fbbf24" />
            <circle cx="30" cy="80" r="3.5" fill="#f472b6" />
            <circle cx="18" cy="68" r="3" fill="#38bdf8" />
            <circle cx="15" cy="50" r="3.2" fill="#fbbf24" />
            <circle cx="18" cy="34" r="3" fill="#f472b6" />
          </g>
        )}

        {/* 14. BUTTERFLIES */}
        {activeId === 'butterflies' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#d8b4fe" strokeWidth="2.2" opacity="0.75" />
            {/* Butterfly Top Left */}
            <g transform="translate(14, 18) rotate(-25)">
              <ellipse cx="6" cy="4" rx="4" ry="2.5" fill="#e879f9" opacity="0.9" />
              <ellipse cx="6" cy="8" rx="3" ry="2" fill="#c084fc" opacity="0.9" />
              <ellipse cx="12" cy="4" rx="4" ry="2.5" fill="#e879f9" opacity="0.9" />
              <ellipse cx="12" cy="8" rx="3" ry="2" fill="#c084fc" opacity="0.9" />
              <line x1="9" y1="2" x2="9" y2="10" stroke="#581c87" strokeWidth="1" />
            </g>
            {/* Butterfly Bottom Right */}
            <g transform="translate(72, 68) rotate(35)">
              <ellipse cx="6" cy="4" rx="3.5" ry="2" fill="#38bdf8" opacity="0.9" />
              <ellipse cx="12" cy="4" rx="3.5" ry="2" fill="#38bdf8" opacity="0.9" />
              <line x1="9" y1="2" x2="9" y2="8" stroke="#0369a1" strokeWidth="1" />
            </g>
          </g>
        )}

        {/* 15. BUBBLES */}
        {activeId === 'bubbles' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#7dd3fc" strokeWidth="1.8" opacity="0.5" />
            {/* Translucent iridescent bubbles around frame */}
            <circle cx="20" cy="24" r="5" fill="#bae6fd" fillOpacity="0.4" stroke="#e0f2fe" strokeWidth="1" />
            <circle cx="18" cy="22" r="1.5" fill="#ffffff" opacity="0.8" />
            <circle cx="78" cy="28" r="4.2" fill="#fbcfe8" fillOpacity="0.4" stroke="#ffffff" strokeWidth="0.8" />
            <circle cx="76" cy="26" r="1.2" fill="#ffffff" opacity="0.8" />
            <circle cx="82" cy="62" r="5.5" fill="#bae6fd" fillOpacity="0.45" stroke="#ffffff" strokeWidth="1" />
            <circle cx="80" cy="60" r="1.6" fill="#ffffff" opacity="0.85" />
            <circle cx="24" cy="74" r="4" fill="#ddd6fe" fillOpacity="0.4" stroke="#ffffff" strokeWidth="0.8" />
          </g>
        )}

        {/* 16. MELODY */}
        {activeId === 'melody' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#a855f7" strokeWidth="2.2" opacity="0.7" />
            {/* Floating Music Notes */}
            {/* Eighth note top-left */}
            <g transform="translate(18, 16) scale(0.9)">
              <ellipse cx="4" cy="8" rx="2.5" ry="1.8" fill="#c084fc" transform="rotate(-20 4 8)" />
              <line x1="6" y1="7" x2="6" y2="1" stroke="#c084fc" strokeWidth="1.2" />
              <path d="M6 1 Q9 2 9 4" stroke="#c084fc" strokeWidth="1.2" fill="none" />
            </g>
            {/* Beamed eighth notes top-right */}
            <g transform="translate(68, 14) scale(0.9)">
              <ellipse cx="3" cy="8" rx="2" ry="1.5" fill="#38bdf8" transform="rotate(-20 3 8)" />
              <ellipse cx="9" cy="8" rx="2" ry="1.5" fill="#38bdf8" transform="rotate(-20 9 8)" />
              <line x1="4.5" y1="7" x2="4.5" y2="2" stroke="#38bdf8" strokeWidth="1.2" />
              <line x1="10.5" y1="7" x2="10.5" y2="2" stroke="#38bdf8" strokeWidth="1.2" />
              <line x1="4.5" y1="2" x2="10.5" y2="2" stroke="#38bdf8" strokeWidth="1.8" />
            </g>
            {/* Sharp sign bottom */}
            <text x="76" y="74" fill="#f472b6" fontSize="10" fontWeight="bold">♪</text>
          </g>
        )}

        {/* 17. CYBER RING */}
        {activeId === 'cyber_ring' && (
          <g>
            {/* Sci-fi HUD segmented ring */}
            <circle cx="50" cy="50" r="36.5" stroke="#00f5ff" strokeWidth="2" strokeDasharray="30 15 45 10 20 8" />
            <circle cx="50" cy="50" r="39" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="4 6" opacity="0.6" />
            {/* Reticle brackets */}
            <path d="M12 44 L10 50 L12 56" stroke="#00f5ff" strokeWidth="1.5" fill="none" />
            <path d="M88 44 L90 50 L88 56" stroke="#00f5ff" strokeWidth="1.5" fill="none" />
            <path d="M44 12 L50 10 L56 12" stroke="#00f5ff" strokeWidth="1.5" fill="none" />
            <path d="M44 88 L50 90 L56 88" stroke="#00f5ff" strokeWidth="1.5" fill="none" />
          </g>
        )}

        {/* 18. CRESCENT NIGHT */}
        {activeId === 'crescent_night' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#6366f1" strokeWidth="2" opacity="0.7" />
            {/* Golden Crescent Moon Top Right */}
            <path
              d="M72 14 C68 20 72 28 80 28 C74 34 64 30 64 22 C64 16 68 14 72 14 Z"
              fill="#fbbf24"
              filter="url(#glowFilterSoft)"
            />
            {/* Tiny stars */}
            <circle cx="22" cy="30" r="1.2" fill="#ffffff" opacity="0.9" />
            <circle cx="28" cy="74" r="1.4" fill="#818cf8" opacity="0.8" />
          </g>
        )}

        {/* 19. KITSUNE */}
        {activeId === 'kitsune' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#f97316" strokeWidth="2.2" opacity="0.75" />
            {/* Fox Ears at Top */}
            <polygon points="26,18 20,4 36,12" fill="#ea580c" stroke="#fed7aa" strokeWidth="1" />
            <polygon points="26,15 22,7 33,12" fill="#ffffff" />
            <polygon points="74,18 80,4 64,12" fill="#ea580c" stroke="#fed7aa" strokeWidth="1" />
            <polygon points="74,15 78,7 67,12" fill="#ffffff" />
            {/* Fluffy Fox Tail bottom left */}
            <path
              d="M20 70 Q6 76 8 86 Q14 96 26 88 Q32 82 22 72 Z"
              fill="#ea580c"
              stroke="#fed7aa"
              strokeWidth="1"
            />
            <path d="M8 86 Q14 96 22 92 Z" fill="#ffffff" />
          </g>
        )}

        {/* 20. ANGEL HALO */}
        {activeId === 'angel_halo' && (
          <g>
            {/* Golden Halo above head */}
            <ellipse
              cx="50"
              cy="9"
              rx="18"
              ry="4.5"
              stroke="#fbbf24"
              strokeWidth="2.5"
              fill="none"
              filter="url(#glowFilterSoft)"
            />
            {/* Angel Wings left & right */}
            {/* Left Wing */}
            <path
              d="M15 48 C6 38 4 28 8 22 C14 26 14 36 17 44 C12 40 10 32 16 28"
              stroke="#ffffff"
              strokeWidth="2.5"
              fill="#f8fafc"
              opacity="0.9"
            />
            {/* Right Wing */}
            <path
              d="M85 48 C94 38 96 28 92 22 C86 26 86 36 83 44 C88 40 90 32 84 28"
              stroke="#ffffff"
              strokeWidth="2.5"
              fill="#f8fafc"
              opacity="0.9"
            />
          </g>
        )}

        {/* 21. DEVIL HORNS */}
        {activeId === 'devil_horns' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="#dc2626" strokeWidth="2.4" opacity="0.8" />
            {/* Left Horn */}
            <path
              d="M30 18 Q22 10 18 2 Q28 6 34 16 Z"
              fill="#dc2626"
              stroke="#ef4444"
              strokeWidth="0.8"
              filter="url(#glowFilterSoft)"
            />
            {/* Right Horn */}
            <path
              d="M70 18 Q78 10 82 2 Q72 6 66 16 Z"
              fill="#dc2626"
              stroke="#ef4444"
              strokeWidth="0.8"
              filter="url(#glowFilterSoft)"
            />
            {/* Demon tail tip at bottom */}
            <path d="M48 88 L52 88 L50 94 Z" fill="#dc2626" />
          </g>
        )}

        {/* 22. JADE DRAGON */}
        {activeId === 'jade_dragon' && (
          <g>
            {/* Coiling Serpentine Emerald Chinese Dragon */}
            <circle
              cx="50"
              cy="50"
              r="36.5"
              stroke="url(#jadeDragonGrad)"
              strokeWidth="3.4"
              strokeDasharray="20 4 10 4 30 6"
              filter="url(#glowFilterSoft)"
            />
            {/* Dragon Head at top right */}
            <g transform="translate(68, 12) rotate(30)">
              <polygon points="0,0 12,4 10,12 2,10" fill="#10b981" />
              <circle cx="8" cy="5" r="1.4" fill="#fef08a" />
              {/* Whiskers */}
              <path d="M12 4 Q16 2 20 6" stroke="#86efac" strokeWidth="0.8" fill="none" />
              <path d="M10 10 Q14 12 18 10" stroke="#86efac" strokeWidth="0.8" fill="none" />
            </g>
            {/* Dragon Tail at bottom left */}
            <path d="M22 72 Q16 80 18 86 Q22 84 24 76" stroke="#059669" strokeWidth="2" fill="none" />
          </g>
        )}

        {/* 23. ROYAL CROWN */}
        {activeId === 'royal_crown' && (
          <g>
            <circle cx="50" cy="50" r="36" stroke="url(#goldLaurelGrad)" strokeWidth="2.5" />
            {/* Imperial Jeweled Crown at top */}
            <g transform="translate(26, 4)">
              <path
                d="M4 16 L8 6 L18 13 L24 2 L30 13 L40 6 L44 16 Z"
                fill="url(#goldLaurelGrad)"
                stroke="#d97706"
                strokeWidth="0.8"
                filter="url(#glowFilterSoft)"
              />
              <rect x="3" y="15" width="42" height="3.5" rx="1.5" fill="#d97706" />
              {/* Jewels */}
              <circle cx="24" cy="8" r="1.8" fill="#ef4444" />
              <circle cx="14" cy="12" r="1.4" fill="#3b82f6" />
              <circle cx="34" cy="12" r="1.4" fill="#10b981" />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
