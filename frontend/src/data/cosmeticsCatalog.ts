import type {
  AvatarDecorationId,
  BannerEffectId,
  CosmeticItem,
  UnlockRequirement,
} from '../types/cosmetics';
import type { UserProfile } from '../types/user';

export const AVATAR_DECORATIONS: CosmeticItem<AvatarDecorationId>[] = [
  // Default None
  {
    id: 'none',
    name: 'None',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'No avatar decoration',
  },
  // CLASSICS
  {
    id: 'neon_halo',
    name: 'Neon Halo',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Dual-tone pulsing neon ring in electric cyan and magenta',
  },
  {
    id: 'ember_crown',
    name: 'Ember Crown',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Fiery flaming golden crown with rising ember sparks',
  },
  {
    id: 'sakura_drift',
    name: 'Sakura Drift',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Delicate cherry blossoms clustered with floating pink petals',
  },
  {
    id: 'frostbite',
    name: 'Frostbite',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Sharp crystalline ice shards radiating frosted cold',
  },
  {
    id: 'lucky_clover',
    name: 'Lucky Clover',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Four-leaf emerald clovers bringing luck to your profile',
  },
  {
    id: 'thunderstrike',
    name: 'Thunderstrike',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Crackling lightning bolts surging around the perimeter',
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Vibrant pulsing heartbeat line and radiant affection',
  },
  {
    id: 'neko_ears',
    name: 'Neko Ears',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Adorable anime cat ears perched with soft pink accents',
  },
  {
    id: 'victory_laurel',
    name: 'Victory Laurel',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Golden laurel wreath celebrating champions and victory',
  },
  {
    id: 'starlight',
    name: 'Starlight',
    category: 'CLASSICS',
    requirement: { type: 'free' },
    description: 'Deep celestial ring sparkling with glittering 4-point stars',
  },

  // SEASONAL
  {
    id: 'pumpkin_night',
    name: 'Pumpkin Night',
    category: 'SEASONAL',
    requirement: { type: 'seasonal', seasonLabel: 'October', seasonMonths: [10] },
    description: 'Spooky jack-o-lantern pumpkins with eerie flame glow',
  },
  {
    id: 'frosty_hat',
    name: 'Frosty Hat',
    category: 'SEASONAL',
    requirement: { type: 'seasonal', seasonLabel: 'Dec-Feb', seasonMonths: [12, 1, 2] },
    description: 'Cozy holiday Santa hat with fluffy white trim and pom-pom',
  },
  {
    id: 'spring_bloom',
    name: 'Spring Bloom',
    category: 'SEASONAL',
    requirement: { type: 'seasonal', seasonLabel: 'Mar-May', seasonMonths: [3, 4, 5] },
    description: 'Vibrant spring flower garland blooming around the ring',
  },

  // CUTE
  {
    id: 'butterflies',
    name: 'Butterflies',
    category: 'CUTE',
    requirement: { type: 'level', level: 1 },
    description: 'Fluttering pastel butterflies dancing around the border',
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    category: 'CUTE',
    requirement: { type: 'level', level: 1 },
    description: 'Glistening iridescent soap bubbles floating playfully',
  },
  {
    id: 'melody',
    name: 'Melody',
    category: 'CUTE',
    requirement: { type: 'level', level: 2 },
    description: 'Musical clefs and eighth notes bobbing in harmony',
  },

  // NIGHT & TECH
  {
    id: 'cyber_ring',
    name: 'Cyber Ring',
    category: 'NIGHT & TECH',
    requirement: { type: 'level', level: 3 },
    description: 'Futuristic sci-fi HUD ring with rotating targeting reticles',
  },
  {
    id: 'crescent_night',
    name: 'Crescent Night',
    category: 'NIGHT & TECH',
    requirement: { type: 'level', level: 3 },
    description: 'Luminous golden crescent moon nestled in starry nebula dust',
  },

  // FANTASY
  {
    id: 'kitsune',
    name: 'Kitsune',
    category: 'FANTASY',
    requirement: { type: 'level', level: 5 },
    description: 'Mystical fox ears and a fluffy swishing fox tail',
  },
  {
    id: 'angel_halo',
    name: 'Angel Halo',
    category: 'FANTASY',
    requirement: { type: 'level', level: 5 },
    description: 'Golden suspended halo and soft feathered angel wings',
  },
  {
    id: 'devil_horns',
    name: 'Devil Horns',
    category: 'FANTASY',
    requirement: { type: 'level', level: 5 },
    description: 'Sharp crimson horns with dark demonic ember glow',
  },
  {
    id: 'jade_dragon',
    name: 'Jade Dragon',
    category: 'FANTASY',
    requirement: { type: 'level', level: 10 },
    description: 'Imperial emerald dragon coiling around the entire frame',
  },

  // VIP
  {
    id: 'royal_crown',
    name: 'Royal Crown',
    category: 'VIP',
    requirement: { type: 'vip', vipOnly: true },
    description: 'Exquisite imperial gold crown with ruby and sapphire jewels',
  },
];

export const BANNER_EFFECTS: CosmeticItem<BannerEffectId>[] = [
  // BASIC
  {
    id: 'none',
    name: 'None',
    category: 'BASIC',
    requirement: { type: 'free' },
    description: 'Clean banner without particle overlays',
  },

  // NATURE
  {
    id: 'sakura',
    name: 'Sakura',
    category: 'NATURE',
    requirement: { type: 'free' },
    description: 'Falling pink cherry blossom petals drifting across the banner',
  },
  {
    id: 'snowfall',
    name: 'Snowfall',
    category: 'NATURE',
    requirement: { type: 'free' },
    description: 'Peaceful white snowflakes descending with gentle flutter',
  },
  {
    id: 'night_sky',
    name: 'Night sky',
    category: 'NATURE',
    requirement: { type: 'free' },
    description: 'Twinkling celestial starfield with subtle shooting stars',
  },
  {
    id: 'fireflies',
    name: 'Fireflies',
    category: 'NATURE',
    requirement: { type: 'free' },
    description: 'Warm glowing fireflies hovering with ambient luminescence',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    category: 'NATURE',
    requirement: { type: 'free' },
    description: 'Shifting northern lights ribbons undulating in night sky',
  },

  // PARTICLES
  {
    id: 'embers',
    name: 'Embers',
    category: 'PARTICLES',
    requirement: { type: 'free' },
    description: 'Rising fiery sparks and coal embers floating upward',
  },
  {
    id: 'hearts',
    name: 'Hearts',
    category: 'PARTICLES',
    requirement: { type: 'free' },
    description: 'Floating sweet pink hearts drifting with gentle sway',
  },
  {
    id: 'confetti',
    name: 'Confetti',
    category: 'PARTICLES',
    requirement: { type: 'free' },
    description: 'Celebratory colorful confetti squares and streamers tumbling down',
  },

  // WEATHER
  {
    id: 'neon_rain',
    name: 'Neon rain',
    category: 'WEATHER',
    requirement: { type: 'free' },
    description: 'Cyberpunk luminous rain streaks in neon cyan and magenta',
  },
  {
    id: 'autumn_leaves',
    name: 'Autumn leaves',
    category: 'WEATHER',
    requirement: { type: 'free' },
    description: 'Golden, russet, and crimson maple leaves fluttering down',
  },

  // ADVANCED
  {
    id: 'bubbles',
    name: 'Bubbles',
    category: 'ADVANCED',
    requirement: { type: 'level', level: 2 },
    description: 'Translucent glistening soap bubbles floating upward',
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    category: 'ADVANCED',
    requirement: { type: 'level', level: 5 },
    description: 'Vibrant celebratory firework explosions radiating sparks',
  },
  {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    category: 'ADVANCED',
    requirement: { type: 'level', level: 5 },
    description: 'Driving rainstorm with periodic dramatic lightning flashes',
  },

  // VIP
  {
    id: 'code_rain',
    name: 'Code rain',
    category: 'VIP',
    requirement: { type: 'vip', vipOnly: true },
    description: 'Matrix-style cascading streams of neon green digital characters',
  },
];

/**
 * Checks whether a given cosmetic is unlocked for a user.
 * - VIP users have all cosmetics unlocked ("VIP members have all the rest").
 * - Level-locked cosmetics unlock when user.level >= requirement.level.
 * - Seasonal cosmetics unlock during their active months (or for VIP).
 * - Free cosmetics unlock for everyone (Level 0+).
 */
export function isCosmeticUnlocked(
  requirement: UnlockRequirement,
  user: UserProfile | null | undefined,
  currentDate: Date = new Date()
): boolean {
  if (requirement.type === 'free') {
    return true;
  }

  // VIP members have all cosmetics unlocked
  if (user?.isVip) {
    return true;
  }

  if (requirement.type === 'vip') {
    return Boolean(user?.isVip);
  }

  if (requirement.type === 'level') {
    const userLevel = user?.level ?? 0;
    return userLevel >= (requirement.level ?? 0);
  }

  if (requirement.type === 'seasonal') {
    const month = currentDate.getMonth() + 1; // 1-12
    return Boolean(requirement.seasonMonths?.includes(month));
  }

  return false;
}

/**
 * Returns formatted lock badge text (e.g., "Level 2", "October", "VIP").
 */
export function getCosmeticBadgeLabel(requirement: UnlockRequirement): string | null {
  if (requirement.type === 'free') return null;
  if (requirement.type === 'vip') return 'VIP';
  if (requirement.type === 'level') return `Level ${requirement.level}`;
  if (requirement.type === 'seasonal') return requirement.seasonLabel || 'Seasonal';
  return null;
}
