export type AvatarDecorationId =
  // Default
  | 'none'
  // Classics (Level 0)
  | 'neon_halo'
  | 'ember_crown'
  | 'sakura_drift'
  | 'frostbite'
  | 'lucky_clover'
  | 'thunderstrike'
  | 'heartbeat'
  | 'neko_ears'
  | 'victory_laurel'
  | 'starlight'
  // Seasonal
  | 'pumpkin_night'
  | 'frosty_hat'
  | 'spring_bloom'
  // Cute
  | 'butterflies'
  | 'bubbles'
  | 'melody'
  // Night & Tech
  | 'cyber_ring'
  | 'crescent_night'
  // Fantasy
  | 'kitsune'
  | 'angel_halo'
  | 'devil_horns'
  | 'jade_dragon'
  // VIP
  | 'royal_crown'
  // Backwards compatibility legacy frames
  | 'crown'
  | 'celestial'
  | 'crimson'
  | 'neon';

export type BannerEffectId =
  // Basic
  | 'none'
  // Nature
  | 'sakura'
  | 'snowfall'
  | 'night_sky'
  | 'fireflies'
  | 'aurora'
  // Particles
  | 'embers'
  | 'hearts'
  | 'confetti'
  // Weather
  | 'neon_rain'
  | 'autumn_leaves'
  // Advanced
  | 'bubbles'
  | 'fireworks'
  | 'thunderstorm'
  // VIP
  | 'code_rain'
  // Backwards compatibility
  | 'snow'
  | 'stars';

export type CosmeticCategory =
  | 'CLASSICS'
  | 'SEASONAL'
  | 'CUTE'
  | 'NIGHT & TECH'
  | 'FANTASY'
  | 'BASIC'
  | 'NATURE'
  | 'PARTICLES'
  | 'WEATHER'
  | 'ADVANCED'
  | 'VIP';

export interface UnlockRequirement {
  type: 'free' | 'level' | 'seasonal' | 'vip';
  level?: number;
  seasonLabel?: string;
  seasonMonths?: number[]; // 1 to 12
  vipOnly?: boolean;
}

export interface CosmeticItem<T extends string = string> {
  id: T;
  name: string;
  category: CosmeticCategory;
  requirement: UnlockRequirement;
  description?: string;
}
